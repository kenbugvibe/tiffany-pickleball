-- Regular court bookings no longer expire while the customer completes GCash
-- payment. Open-play and Sunday-unli holds are removed by the next migration.

begin;

create or replace function public.prepare_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration_hours integer;
  v_priced_hours integer;
  v_court_fee integer;
  v_paddle_price integer;
begin
  if new.reference is null or pg_catalog.btrim(new.reference) = '' then
    new.reference := public.next_public_reference();
  end if;

  if not public.is_valid_court_period(new.starts_at, new.ends_at) then
    raise exception 'Booking must use whole-hour slots between 8:00 AM and midnight Asia/Manila';
  end if;

  v_duration_hours :=
    extract(epoch from (new.ends_at - new.starts_at))::integer / 3600;

  if new.kind in ('regular', 'recurring') then
    if new.customer_id is null then
      raise exception 'Customer is required for regular and recurring bookings';
    end if;

    select
      pg_catalog.count(*)::integer,
      coalesce(pg_catalog.sum(rate.price_per_hour), 0)::integer
    into v_priced_hours, v_court_fee
    from pg_catalog.generate_series(0, v_duration_hours - 1) as slot(offset_hours)
    join public.rate_blocks rate
      on extract(
        hour from pg_catalog.timezone(
          'Asia/Manila',
          new.starts_at + slot.offset_hours * interval '1 hour'
        )
      )::integer >= rate.start_hour
      and extract(
        hour from pg_catalog.timezone(
          'Asia/Manila',
          new.starts_at + slot.offset_hours * interval '1 hour'
        )
      )::integer < rate.end_hour;

    if v_priced_hours <> v_duration_hours then
      raise exception 'Every booking hour must have a configured court rate';
    end if;

    select paddle_price_per_hour
    into v_paddle_price
    from public.business_settings
    where id = 1;

    new.court_fee := v_court_fee;
    new.paddle_fee := new.paddle_count * v_paddle_price * v_duration_hours;
    new.total_amount := new.court_fee + new.paddle_fee;

    if tg_op = 'INSERT' and new.kind = 'regular' then
      if new.starts_at <= pg_catalog.statement_timestamp() then
        raise exception 'A customer booking must start in the future';
      end if;

      new.status := 'pending';
      new.hold_expires_at := null;
      new.payment_proof_submitted_at := null;
      new.block_reason := null;
      new.internal_note := null;
      new.sunday_unli_session_id := null;
      new.recurring_rule_id := null;
    elsif new.kind = 'recurring' then
      new.hold_expires_at := null;
    end if;
  else
    new.customer_id := null;
    new.paddle_count := 0;
    new.court_fee := 0;
    new.paddle_fee := 0;
    new.total_amount := 0;
    new.hold_expires_at := null;
  end if;

  return new;
end;
$$;

-- Preserve regular bookings that are still waiting for proof when this
-- migration is applied. Already-cancelled bookings remain cancelled.
update public.bookings
set hold_expires_at = null
where kind = 'regular'
  and status = 'pending'
  and payment_proof_submitted_at is null;

create or replace function public.submit_booking_payment(
  p_booking_id uuid,
  p_gcash_ref text,
  p_receipt_path text,
  p_customer_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  if pg_catalog.length(pg_catalog.btrim(p_gcash_ref)) < 6 then
    raise exception 'GCash reference is required';
  end if;

  if p_receipt_path is null
     or pg_catalog.split_part(p_receipt_path, '/', 1) <> (select auth.uid())::text
     or pg_catalog.strpos(p_receipt_path, '..') > 0 then
    raise exception 'Receipt path is invalid';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'payment-receipts'
      and object.name = p_receipt_path
  ) then
    raise exception 'Receipt file does not exist';
  end if;

  if pg_catalog.length(coalesce(p_customer_note, '')) > 500 then
    raise exception 'Customer note is too long';
  end if;

  update public.bookings booking
  set customer_note = nullif(
    pg_catalog.btrim(coalesce(p_customer_note, '')),
    ''
  )
  from public.customers customer
  where booking.id = p_booking_id
    and booking.customer_id = customer.id
    and customer.auth_user_id = (select auth.uid())
    and booking.kind = 'regular'
    and booking.status = 'pending'
    and booking.payment_proof_submitted_at is null;

  if not found then
    raise exception 'Booking is not awaiting payment';
  end if;

  insert into public.payments (
    booking_id,
    gcash_ref,
    receipt_path
  )
  values (
    p_booking_id,
    pg_catalog.btrim(p_gcash_ref),
    p_receipt_path
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

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
      and status = 'pending'
      and hold_expires_at > pg_catalog.statement_timestamp();

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
      and status = 'pending'
      and hold_expires_at > pg_catalog.statement_timestamp();

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

  return new;
end;
$$;

create or replace function public.expire_payment_holds()
returns table (
  bookings_cancelled integer,
  open_play_signups_cancelled integer,
  sunday_unli_signups_cancelled integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  bookings_cancelled := 0;

  update public.open_play_signups
  set status = 'cancelled'
  where status = 'pending'
    and payment_proof_submitted_at is null
    and hold_expires_at <= pg_catalog.statement_timestamp();

  get diagnostics open_play_signups_cancelled = row_count;

  update public.sunday_unli_signups
  set status = 'cancelled'
  where status = 'pending'
    and payment_proof_submitted_at is null
    and hold_expires_at <= pg_catalog.statement_timestamp();

  get diagnostics sunday_unli_signups_cancelled = row_count;

  return next;
end;
$$;

commit;
