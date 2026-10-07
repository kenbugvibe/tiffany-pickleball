-- Security hardening from the October 7, 2026 audit.
--
-- 1. Customers cannot squat on courts: at most 2 upcoming unpaid court
--    bookings per customer, at most 60 days ahead, at most 8 paddles. These
--    rules live in the database because customers can insert bookings
--    directly through the public data API, bypassing the app's form checks.
-- 2. Customers can no longer insert payments directly. The app always uses
--    the submit_*_payment functions, which also validate the receipt path.
-- 3. Free-text fields get length limits.
-- 4. The owner can cancel an unpaid court booking and email the customer.
--
-- next_public_reference() stays executable by authenticated users: column
-- defaults run with the inserting user's privileges, so revoking it would
-- break customer booking inserts.

begin;

---------------------------------------------------------------------------
-- 1. Customer booking limits
---------------------------------------------------------------------------
create or replace function public.enforce_customer_booking_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unpaid_count integer;
begin
  if new.kind <> 'regular' or (select public.is_admin()) then
    return new;
  end if;

  if new.paddle_count > 8 then
    raise exception 'A booking can include at most 8 paddles'
      using errcode = 'TP003';
  end if;

  if new.starts_at > pg_catalog.statement_timestamp() + interval '60 days' then
    raise exception 'Bookings can be made at most 60 days ahead'
      using errcode = 'TP002';
  end if;

  -- Serialize this customer's booking inserts so two parallel requests
  -- cannot both pass the unpaid-booking count.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('customer-booking:' || new.customer_id::text)
  );

  select pg_catalog.count(*)::integer
  into v_unpaid_count
  from public.bookings booking
  where booking.customer_id = new.customer_id
    and booking.kind = 'regular'
    and booking.status = 'pending'
    and booking.payment_proof_submitted_at is null
    and booking.ends_at > pg_catalog.statement_timestamp();

  if v_unpaid_count >= 2 then
    raise exception 'Upload payment for your existing bookings before reserving more'
      using errcode = 'TP001';
  end if;

  return new;
end;
$$;

-- Like the other trigger functions, inserting roles need EXECUTE. Trigger
-- functions cannot be called directly, so this exposes nothing.
revoke all on function public.enforce_customer_booking_limits() from public, anon;
grant execute on function public.enforce_customer_booking_limits()
to authenticated, service_role;

drop trigger if exists bookings_enforce_customer_limits on public.bookings;

create trigger bookings_enforce_customer_limits
before insert on public.bookings
for each row
execute function public.enforce_customer_booking_limits();

-- Supports the unpaid-booking count above.
create index if not exists bookings_customer_unpaid_idx
on public.bookings (customer_id, ends_at)
where kind = 'regular'
  and status = 'pending'
  and payment_proof_submitted_at is null;

---------------------------------------------------------------------------
-- 2. Payments are created only through the submit functions
---------------------------------------------------------------------------
drop policy if exists payments_create_own on public.payments;

revoke insert on table public.payments from anon, authenticated;

-- Never trust caller-supplied reschedule timestamps on new payments.
create or replace function public.prepare_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount integer;
begin
  if pg_catalog.num_nonnulls(
    new.booking_id,
    new.open_play_signup_id,
    new.sunday_unli_signup_id
  ) <> 1 then
    raise exception 'Payment must belong to exactly one booking or signup';
  end if;

  if new.booking_id is not null then
    select total_amount
    into v_amount
    from public.bookings
    where id = new.booking_id
      and kind in ('regular', 'recurring')
      and status = 'pending';

    if v_amount is null then
      raise exception 'Booking is not awaiting payment';
    end if;

    update public.bookings
    set
      hold_expires_at = null,
      payment_proof_submitted_at = pg_catalog.statement_timestamp()
    where id = new.booking_id;
  elsif new.open_play_signup_id is not null then
    select amount_due
    into v_amount
    from public.open_play_signups
    where id = new.open_play_signup_id
      and status = 'pending';

    if v_amount is null then
      raise exception 'Open-play signup is not awaiting payment';
    end if;

    update public.open_play_signups
    set
      hold_expires_at = null,
      payment_proof_submitted_at = pg_catalog.statement_timestamp()
    where id = new.open_play_signup_id;
  else
    select amount_due
    into v_amount
    from public.sunday_unli_signups
    where id = new.sunday_unli_signup_id
      and status = 'pending';

    if v_amount is null then
      raise exception 'Sunday unli signup is not awaiting payment';
    end if;

    update public.sunday_unli_signups
    set
      hold_expires_at = null,
      payment_proof_submitted_at = pg_catalog.statement_timestamp()
    where id = new.sunday_unli_signup_id;
  end if;

  new.amount := v_amount;
  new.status := 'unverified';
  new.verified_at := null;
  new.refunded_at := null;
  new.rescheduled_at := null;

  return new;
end;
$$;

---------------------------------------------------------------------------
-- 3. Length limits on free text (NOT VALID: enforced for new and updated
--    rows without failing on any existing data)
---------------------------------------------------------------------------
alter table public.bookings
  add constraint booking_customer_note_length
  check (customer_note is null or pg_catalog.length(customer_note) <= 500)
  not valid;

alter table public.bookings
  add constraint booking_internal_note_length
  check (internal_note is null or pg_catalog.length(internal_note) <= 4000)
  not valid;

alter table public.payments
  add constraint payment_gcash_ref_length
  check (pg_catalog.length(gcash_ref) <= 64)
  not valid;

alter table public.payments
  add constraint payment_receipt_path_length
  check (pg_catalog.length(receipt_path) <= 300)
  not valid;

---------------------------------------------------------------------------
-- 4. Owner cancels an unpaid court booking
---------------------------------------------------------------------------
alter table public.customer_notifications
  drop constraint customer_notification_kind;

alter table public.customer_notifications
  add constraint customer_notification_kind check (
    (
      kind = 'court_blocked'
      and block_id is not null
      and reason is not null
      and pg_catalog.length(pg_catalog.btrim(reason)) > 0
      and previous_starts_at is null
      and event_label is null
    )
    or (
      kind = 'booking_rescheduled'
      and block_id is null
      and previous_court_name is not null
      and previous_starts_at is not null
      and previous_ends_at is not null
      and event_label is null
    )
    or (
      kind = 'event_cancelled'
      and block_id is null
      and previous_starts_at is null
      and event_label is not null
    )
    or (
      kind = 'receipt_rejected'
      and block_id is null
      and previous_starts_at is null
      and refund_amount = 0
    )
    or (
      kind = 'unpaid_cancelled'
      and block_id is null
      and previous_starts_at is null
      and event_label is null
      and refund_amount = 0
    )
  );

create or replace function public.cancel_unpaid_booking(
  p_booking_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_booking public.bookings%rowtype;
  v_notification_id uuid;
begin
  if (select auth.uid()) is null
     or not exists (
       select 1
       from public.admin_users
       where user_id = (select auth.uid())
     ) then
    raise exception 'Owner authorization is required'
      using errcode = '42501';
  end if;

  if pg_catalog.length(coalesce(v_reason, '')) > 240 then
    raise exception 'Cancellation reason is too long';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found
     or v_booking.kind <> 'regular'
     or v_booking.status <> 'pending' then
    raise exception 'Only a pending court booking can be cancelled here';
  end if;

  if v_booking.payment_proof_submitted_at is not null
     or exists (
       select 1
       from public.payments payment
       where payment.booking_id = p_booking_id
         and payment.status in ('unverified', 'verified')
     ) then
    raise exception 'This booking has a receipt. Review or reschedule it instead';
  end if;

  update public.bookings
  set
    status = 'cancelled',
    internal_note = case
      when internal_note is null or pg_catalog.btrim(internal_note) = ''
        then 'Cancelled by owner: payment not received'
      else internal_note || E'\nCancelled by owner: payment not received'
    end
  where id = p_booking_id;

  insert into public.customer_notifications (
    kind,
    booking_id,
    recipient_name,
    recipient_email,
    booking_reference,
    court_name,
    starts_at,
    ends_at,
    reason,
    refund_amount
  )
  select
    'unpaid_cancelled',
    v_booking.id,
    customer.full_name,
    customer.email,
    v_booking.reference,
    court.name,
    v_booking.starts_at,
    v_booking.ends_at,
    v_reason,
    0
  from public.customers customer
  join public.courts court on court.id = v_booking.court_id
  where customer.id = v_booking.customer_id
  returning id into v_notification_id;

  return pg_catalog.jsonb_build_object(
    'reference', v_booking.reference,
    'notification_id', v_notification_id
  );
end;
$$;

revoke all on function public.cancel_unpaid_booking(uuid, text) from public, anon;

grant execute on function public.cancel_unpaid_booking(uuid, text)
to authenticated, service_role;

commit;
