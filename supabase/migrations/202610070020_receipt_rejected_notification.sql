-- Email the customer when the owner rejects a GCash receipt. Rejection already
-- cancels the reservation and releases the slot; this migration queues a
-- customer notification in the same transaction so the app can send it.

begin;

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
  );

-- The return type changes from text to jsonb, so the function is recreated.
drop function public.review_payment(uuid, text);

create function public.review_payment(
  p_payment_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_reference text;
  v_customer_id uuid;
  v_notification_booking_id uuid;
  v_court_name text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_event_label text;
  v_parent_updated boolean := false;
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

  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject';
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment was not found';
  end if;

  if v_payment.status <> 'unverified' then
    raise exception 'Payment has already been reviewed';
  end if;

  if v_payment.booking_id is not null then
    select booking.reference, booking.customer_id, booking.id,
           court.name, booking.starts_at, booking.ends_at
    into v_reference, v_customer_id, v_notification_booking_id,
         v_court_name, v_starts_at, v_ends_at
    from public.bookings booking
    join public.courts court on court.id = booking.court_id
    where booking.id = v_payment.booking_id
    for update of booking;

    if p_decision = 'approve' then
      update public.bookings
      set status = 'confirmed', hold_expires_at = null
      where id = v_payment.booking_id
        and status = 'pending';
    else
      update public.bookings
      set status = 'cancelled', hold_expires_at = null
      where id = v_payment.booking_id
        and status in ('pending', 'cancelled');
    end if;

    v_parent_updated := found;
  elsif v_payment.open_play_signup_id is not null then
    select signup.reference, signup.customer_id, session.booking_id,
           booking.starts_at, booking.ends_at, session.title
    into v_reference, v_customer_id, v_notification_booking_id,
         v_starts_at, v_ends_at, v_event_label
    from public.open_play_signups signup
    join public.open_play_sessions session on session.id = signup.session_id
    join public.bookings booking on booking.id = session.booking_id
    where signup.id = v_payment.open_play_signup_id
    for update of signup;

    select pg_catalog.string_agg(court.name, ', ' order by court.id)
    into v_court_name
    from public.open_play_sessions session
    join public.open_play_session_courts allocation
      on allocation.session_id = session.id
    join public.courts court on court.id = allocation.court_id
    where session.booking_id = v_notification_booking_id;

    v_court_name := coalesce(v_court_name, 'Open play courts');

    if p_decision = 'approve' then
      update public.open_play_signups
      set status = 'confirmed', hold_expires_at = null
      where id = v_payment.open_play_signup_id
        and status = 'pending';
    else
      update public.open_play_signups
      set status = 'cancelled', hold_expires_at = null
      where id = v_payment.open_play_signup_id
        and status in ('pending', 'cancelled');
    end if;

    v_parent_updated := found;
  else
    select signup.reference, signup.customer_id,
           session.starts_at, session.ends_at
    into v_reference, v_customer_id, v_starts_at, v_ends_at
    from public.sunday_unli_signups signup
    join public.sunday_unli_sessions session on session.id = signup.session_id
    where signup.id = v_payment.sunday_unli_signup_id
    for update of signup;

    select booking.id
    into v_notification_booking_id
    from public.bookings booking
    join public.sunday_unli_signups signup
      on signup.session_id = booking.sunday_unli_session_id
    where signup.id = v_payment.sunday_unli_signup_id
    order by booking.court_id
    limit 1;

    v_court_name := 'All courts';
    v_event_label := 'Sunday Unli Play';

    if p_decision = 'approve' then
      update public.sunday_unli_signups
      set status = 'confirmed', hold_expires_at = null
      where id = v_payment.sunday_unli_signup_id
        and status = 'pending';
    else
      update public.sunday_unli_signups
      set status = 'cancelled', hold_expires_at = null
      where id = v_payment.sunday_unli_signup_id
        and status in ('pending', 'cancelled');
    end if;

    v_parent_updated := found;
  end if;

  if not v_parent_updated then
    raise exception 'The reservation is no longer awaiting review';
  end if;

  update public.payments
  set
    status = case
      when p_decision = 'approve' then 'verified'
      else 'rejected'
    end,
    verified_at = case
      when p_decision = 'approve' then pg_catalog.statement_timestamp()
      else null
    end,
    refunded_at = null
  where id = p_payment_id;

  -- A notification row needs an anchor booking. Every reservation type has
  -- one, but the email is skipped rather than blocking the review if not.
  if p_decision = 'reject' and v_notification_booking_id is not null then
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
      refund_amount,
      event_label
    )
    select
      'receipt_rejected',
      v_notification_booking_id,
      customer.full_name,
      customer.email,
      v_reference,
      v_court_name,
      v_starts_at,
      v_ends_at,
      null,
      0,
      v_event_label
    from public.customers customer
    where customer.id = v_customer_id
    returning id into v_notification_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'reference', v_reference,
    'notification_id', v_notification_id
  );
end;
$$;

revoke all on function public.review_payment(uuid, text) from public;

grant execute on function public.review_payment(uuid, text)
to authenticated, service_role;

commit;
