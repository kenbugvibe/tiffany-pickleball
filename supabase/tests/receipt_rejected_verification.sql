-- Tiffany's Pickleball Court - receipt rejection notification verification
-- Run in the Supabase SQL Editor after 202610070020_receipt_rejected_notification.sql.
-- All test rows are rolled back and leave no data behind. No email is sent.

begin;

do $$
declare
  v_owner_id uuid;
  v_customer_id uuid;
  v_day date := (pg_catalog.timezone('Asia/Manila', now()))::date + 402;
  v_sunday date;
  v_booking public.bookings%rowtype;
  v_approved_booking public.bookings%rowtype;
  v_payment_id uuid;
  v_session jsonb;
  v_signup jsonb;
  v_result jsonb;
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
    values (v_owner_id, 'Receipt Test Customer', '09170000000', 'receipt-test@example.invalid')
    returning id into v_customer_id;
  end if;

  -- Two ordinary court bookings: one to reject, one to approve.
  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (
    v_customer_id,
    1,
    (v_day + time '09:00') at time zone 'Asia/Manila',
    (v_day + time '10:00') at time zone 'Asia/Manila',
    'regular',
    0
  )
  returning * into v_booking;

  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (
    v_customer_id,
    2,
    (v_day + time '09:00') at time zone 'Asia/Manila',
    (v_day + time '10:00') at time zone 'Asia/Manila',
    'regular',
    0
  )
  returning * into v_approved_booking;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_owner_id, 'role', 'authenticated')::text,
    true
  );

  ---------------------------------------------------------------------------
  -- Rejecting an ordinary court booking queues a receipt_rejected notice.
  ---------------------------------------------------------------------------
  insert into public.payments (booking_id, gcash_ref, receipt_path)
  values (v_booking.id, 'TEST100001', 'verification/receipt.jpg')
  returning id into v_payment_id;

  -- Non-owners are rejected.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
    true
  );
  v_rejected := false;
  begin
    perform public.review_payment(v_payment_id, 'reject');
  exception when others then
    v_rejected := sqlerrm like '%Owner authorization%';
  end;
  if not v_rejected then
    raise exception 'FAIL: non-owner was able to review a payment';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_owner_id, 'role', 'authenticated')::text,
    true
  );

  v_result := public.review_payment(v_payment_id, 'reject');

  if v_result ->> 'reference' <> v_booking.reference then
    raise exception 'FAIL: review_payment returned the wrong reference: %', v_result;
  end if;

  if exists (
    select 1 from public.bookings
    where id = v_booking.id and status <> 'cancelled'
  ) or not exists (
    select 1 from public.payments
    where id = v_payment_id and status = 'rejected'
  ) then
    raise exception 'FAIL: rejected booking was not cancelled';
  end if;

  select * into v_notification
  from public.customer_notifications
  where id = (v_result ->> 'notification_id')::uuid;

  if v_notification.id is null
     or v_notification.kind <> 'receipt_rejected'
     or v_notification.status <> 'pending'
     or v_notification.booking_id <> v_booking.id
     or v_notification.booking_reference <> v_booking.reference
     or v_notification.court_name <> 'Court 1'
     or v_notification.event_label is not null
     or v_notification.refund_amount <> 0 then
    raise exception 'FAIL: court booking rejection notice was not queued correctly';
  end if;

  ---------------------------------------------------------------------------
  -- Approving a payment queues no notice.
  ---------------------------------------------------------------------------
  insert into public.payments (booking_id, gcash_ref, receipt_path)
  values (v_approved_booking.id, 'TEST100002', 'verification/receipt.jpg')
  returning id into v_payment_id;

  v_result := public.review_payment(v_payment_id, 'approve');

  if v_result ->> 'notification_id' is not null
     or not exists (
       select 1 from public.bookings
       where id = v_approved_booking.id and status = 'confirmed'
     ) then
    raise exception 'FAIL: approval did not confirm cleanly: %', v_result;
  end if;

  ---------------------------------------------------------------------------
  -- Rejecting an open-play registration.
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
  values ((v_signup ->> 'signup_id')::uuid, 'TEST100003', 'verification/receipt.jpg')
  returning id into v_payment_id;

  v_result := public.review_payment(v_payment_id, 'reject');

  select * into v_notification
  from public.customer_notifications
  where id = (v_result ->> 'notification_id')::uuid;

  if v_notification.id is null
     or v_notification.kind <> 'receipt_rejected'
     or v_notification.event_label <> 'Verification open play'
     or v_notification.court_name <> 'Court 3' then
    raise exception 'FAIL: open-play rejection notice was not queued correctly';
  end if;

  ---------------------------------------------------------------------------
  -- Rejecting a Sunday Unli registration.
  ---------------------------------------------------------------------------
  v_sunday := v_day + (7 - extract(isodow from v_day)::integer);

  v_session := public.create_sunday_unli_session(v_sunday, null);
  v_signup := public.create_sunday_unli_signup((v_session ->> 'session_id')::uuid);

  insert into public.payments (sunday_unli_signup_id, gcash_ref, receipt_path)
  values ((v_signup ->> 'signup_id')::uuid, 'TEST100004', 'verification/receipt.jpg')
  returning id into v_payment_id;

  v_result := public.review_payment(v_payment_id, 'reject');

  select * into v_notification
  from public.customer_notifications
  where id = (v_result ->> 'notification_id')::uuid;

  if v_notification.id is null
     or v_notification.kind <> 'receipt_rejected'
     or v_notification.event_label <> 'Sunday Unli Play'
     or v_notification.court_name <> 'All courts' then
    raise exception 'FAIL: Sunday Unli rejection notice was not queued correctly';
  end if;

  raise notice 'PASS: receipt rejection verification';
end;
$$;

rollback;
