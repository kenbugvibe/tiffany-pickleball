-- Tiffany's Pickleball Court - owner reschedule verification
-- Run in the Supabase SQL Editor after 202610030018_owner_reschedule_booking.sql.
-- All test rows are rolled back and leave no data behind. No email is sent.

begin;

do $$
declare
  v_owner_id uuid;
  v_customer_id uuid;
  v_day date := (pg_catalog.timezone('Asia/Manila', now()))::date + 400;
  v_booking public.bookings%rowtype;
  v_moved public.bookings%rowtype;
  v_result jsonb;
  v_notification public.customer_notifications%rowtype;
  v_rejected boolean;
begin
  select user_id
  into v_owner_id
  from public.admin_users
  limit 1;

  if v_owner_id is null then
    raise exception 'Run supabase/setup_owner.sql before this verification';
  end if;

  select id
  into v_customer_id
  from public.customers
  where auth_user_id = v_owner_id;

  if v_customer_id is null then
    insert into public.customers (auth_user_id, full_name, phone, email)
    values (
      v_owner_id,
      'Reschedule Test Customer',
      '09170000000',
      'reschedule-test@example.invalid'
    )
    returning id into v_customer_id;
  end if;

  -- 2-hour morning booking with one paddle on Court 1.
  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (
    v_customer_id,
    1,
    (v_day + time '09:00') at time zone 'Asia/Manila',
    (v_day + time '11:00') at time zone 'Asia/Manila',
    'regular',
    1
  )
  returning * into v_booking;

  -- A court block on Court 3 to test conflicts.
  insert into public.bookings (court_id, starts_at, ends_at, kind, status, block_reason)
  values (
    3,
    (v_day + time '18:00') at time zone 'Asia/Manila',
    (v_day + time '19:00') at time zone 'Asia/Manila',
    'blocked',
    'confirmed',
    'Reschedule verification'
  );

  -- Non-owners are rejected.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
    true
  );
  v_rejected := false;
  begin
    perform public.reschedule_booking(
      v_booking.id, 2::smallint,
      (v_day + time '18:00') at time zone 'Asia/Manila'
    );
  exception when others then
    v_rejected := sqlerrm like '%Owner authorization%';
  end;
  if not v_rejected then
    raise exception 'FAIL: non-owner was able to reschedule';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_owner_id, 'role', 'authenticated')::text,
    true
  );

  -- Moving onto the Court 3 block is rejected.
  v_rejected := false;
  begin
    perform public.reschedule_booking(
      v_booking.id, 3::smallint,
      (v_day + time '17:00') at time zone 'Asia/Manila'
    );
  exception when others then
    v_rejected := sqlerrm like '%no longer available%';
  end;
  if not v_rejected then
    raise exception 'FAIL: reschedule onto an occupied court was allowed';
  end if;

  -- Running past midnight is rejected.
  v_rejected := false;
  begin
    perform public.reschedule_booking(
      v_booking.id, 2::smallint,
      (v_day + time '23:00') at time zone 'Asia/Manila'
    );
  exception when others then
    v_rejected := sqlerrm like '%operating hours%';
  end;
  if not v_rejected then
    raise exception 'FAIL: reschedule past closing time was allowed';
  end if;

  -- Same court and time is rejected.
  v_rejected := false;
  begin
    perform public.reschedule_booking(v_booking.id, 1::smallint, v_booking.starts_at);
  exception when others then
    v_rejected := sqlerrm like '%different court or time%';
  end;
  if not v_rejected then
    raise exception 'FAIL: no-op reschedule was allowed';
  end if;

  -- Move to the Court 2 evening rate. Duration and price must not change.
  v_result := public.reschedule_booking(
    v_booking.id,
    2::smallint,
    (v_day + time '18:00') at time zone 'Asia/Manila',
    'Verification move'
  );

  select * into v_moved from public.bookings where id = v_booking.id;

  if v_moved.court_id <> 2
     or v_moved.starts_at <> (v_day + time '18:00') at time zone 'Asia/Manila'
     or v_moved.ends_at <> (v_day + time '20:00') at time zone 'Asia/Manila' then
    raise exception 'FAIL: booking was not moved to Court 2, 6-8 PM';
  end if;

  if v_moved.court_fee <> v_booking.court_fee
     or v_moved.paddle_fee <> v_booking.paddle_fee
     or v_moved.total_amount <> v_booking.total_amount then
    raise exception 'FAIL: price changed from % to %',
      v_booking.total_amount, v_moved.total_amount;
  end if;

  select *
  into v_notification
  from public.customer_notifications
  where id = (v_result ->> 'notification_id')::uuid;

  if v_notification.id is null
     or v_notification.kind <> 'booking_rescheduled'
     or v_notification.previous_court_name <> 'Court 1'
     or v_notification.previous_starts_at <> v_booking.starts_at
     or v_notification.court_name <> 'Court 2'
     or v_notification.reason <> 'Verification move' then
    raise exception 'FAIL: reschedule notification was not queued correctly';
  end if;

  raise notice 'PASS: owner reschedule verification (price kept at %)',
    v_moved.total_amount;
end;
$$;

rollback;
