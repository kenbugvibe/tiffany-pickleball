-- Tiffany's Pickleball Court - reschedule-instead-of-refund verification
-- Run in the Supabase SQL Editor after 202610070021_reschedule_instead_of_refund.sql.
-- All test rows are rolled back and leave no data behind. No email is sent.

begin;

do $$
declare
  v_owner_id uuid;
  v_customer_id uuid;
  v_day date := (pg_catalog.timezone('Asia/Manila', now()))::date + 403;
  v_paid_booking public.bookings%rowtype;
  v_unpaid_booking public.bookings%rowtype;
  v_payment_id uuid;
  v_session jsonb;
  v_signup jsonb;
  v_result jsonb;
  v_reference text;
  v_notification public.customer_notifications%rowtype;
  v_rejected boolean;
begin
  select user_id into v_owner_id from public.admin_users limit 1;

  if v_owner_id is null then
    raise exception 'Run supabase/setup_owner.sql before this verification';
  end if;

  select id into v_customer_id
  from public.customers
  where auth_user_id = v_owner_id;

  if v_customer_id is null then
    insert into public.customers (auth_user_id, full_name, phone, email)
    values (v_owner_id, 'Reschedule Test Customer', '09170000000', 'reschedule-rule@example.invalid')
    returning id into v_customer_id;
  end if;

  -- A paid booking on Court 1 and an unpaid booking on Court 2.
  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (
    v_customer_id, 1,
    (v_day + time '09:00') at time zone 'Asia/Manila',
    (v_day + time '10:00') at time zone 'Asia/Manila',
    'regular', 0
  )
  returning * into v_paid_booking;

  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (
    v_customer_id, 2,
    (v_day + time '09:00') at time zone 'Asia/Manila',
    (v_day + time '10:00') at time zone 'Asia/Manila',
    'regular', 0
  )
  returning * into v_unpaid_booking;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_owner_id, 'role', 'authenticated')::text,
    true
  );

  insert into public.payments (booking_id, gcash_ref, receipt_path)
  values (v_paid_booking.id, 'TEST200001', 'verification/receipt.jpg');

  ---------------------------------------------------------------------------
  -- A court block over a paid booking is refused.
  ---------------------------------------------------------------------------
  v_rejected := false;
  begin
    perform public.create_court_block(
      array[1]::smallint[],
      (v_day + time '09:00') at time zone 'Asia/Manila',
      (v_day + time '10:00') at time zone 'Asia/Manila',
      'Verification repair',
      array[v_paid_booking.id]
    );
  exception when others then
    v_rejected := sqlerrm like '%Reschedule paid bookings%';
  end;
  if not v_rejected then
    raise exception 'FAIL: a court block cancelled a paid booking';
  end if;

  if not exists (
    select 1 from public.bookings
    where id = v_paid_booking.id and status <> 'cancelled'
  ) then
    raise exception 'FAIL: the paid booking was cancelled';
  end if;

  ---------------------------------------------------------------------------
  -- A court block over an unpaid booking still cancels and emails it.
  ---------------------------------------------------------------------------
  v_result := public.create_court_block(
    array[2]::smallint[],
    (v_day + time '09:00') at time zone 'Asia/Manila',
    (v_day + time '10:00') at time zone 'Asia/Manila',
    'Verification repair',
    array[v_unpaid_booking.id]
  );

  if (v_result ->> 'cancelled_count')::integer <> 1 then
    raise exception 'FAIL: expected 1 cancelled unpaid booking, got %', v_result;
  end if;

  select * into v_notification
  from public.customer_notifications
  where id = (v_result -> 'notification_ids' ->> 0)::uuid;

  if v_notification.id is null
     or v_notification.kind <> 'court_blocked'
     or v_notification.refund_amount <> 0 then
    raise exception 'FAIL: unpaid booking notice was not queued correctly';
  end if;

  ---------------------------------------------------------------------------
  -- Cancelling open play marks the payment reschedule_due.
  ---------------------------------------------------------------------------
  v_session := public.create_open_play_session(
    array[3]::smallint[],
    (v_day + time '13:00') at time zone 'Asia/Manila',
    (v_day + time '15:00') at time zone 'Asia/Manila',
    'Verification open play',
    null
  );
  v_signup := public.create_open_play_signup((v_session ->> 'session_id')::uuid);

  insert into public.payments (open_play_signup_id, gcash_ref, receipt_path)
  values ((v_signup ->> 'signup_id')::uuid, 'TEST200002', 'verification/receipt.jpg')
  returning id into v_payment_id;

  v_result := public.remove_open_play_session(
    (v_session ->> 'session_id')::uuid,
    'Verification rain'
  );

  if not exists (
    select 1 from public.payments
    where id = v_payment_id and status = 'reschedule_due'
  ) then
    raise exception 'FAIL: open-play payment was not marked to reschedule';
  end if;

  select * into v_notification
  from public.customer_notifications
  where id = (v_result -> 'notification_ids' ->> 0)::uuid;

  if v_notification.id is null or v_notification.refund_amount <= 0 then
    raise exception 'FAIL: open-play notice did not carry the paid amount';
  end if;

  ---------------------------------------------------------------------------
  -- Tiffany marks the payment rescheduled.
  ---------------------------------------------------------------------------
  v_reference := public.mark_payment_rescheduled(v_payment_id);

  if v_reference is null then
    raise exception 'FAIL: mark_payment_rescheduled returned no reference';
  end if;

  if not exists (
    select 1 from public.payments
    where id = v_payment_id
      and status = 'rescheduled'
      and rescheduled_at is not null
  ) then
    raise exception 'FAIL: payment was not marked rescheduled';
  end if;

  -- Only reschedule_due payments can be marked rescheduled.
  select id into v_payment_id
  from public.payments
  where booking_id = v_paid_booking.id;

  v_rejected := false;
  begin
    perform public.mark_payment_rescheduled(v_payment_id);
  exception when others then
    v_rejected := sqlerrm like '%waiting to be rescheduled%';
  end;
  if not v_rejected then
    raise exception 'FAIL: an unverified payment was marked rescheduled';
  end if;

  ---------------------------------------------------------------------------
  -- refund_pending is retired.
  ---------------------------------------------------------------------------
  v_rejected := false;
  begin
    update public.payments set status = 'refund_pending' where id = v_payment_id;
  exception when check_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL: refund_pending is still accepted';
  end if;

  raise notice 'PASS: reschedule-instead-of-refund verification';
end;
$$;

rollback;
