-- Tiffany's Pickleball Court - event cancellation verification
-- Run in the Supabase SQL Editor after 202610030019_cancel_events_with_participants.sql.
-- All test rows are rolled back and leave no data behind. No email is sent.

begin;

do $$
declare
  v_owner_id uuid;
  v_customer_id uuid;
  v_day date := (pg_catalog.timezone('Asia/Manila', now()))::date + 401;
  v_sunday date;
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
    values (v_owner_id, 'Event Test Customer', '09170000000', 'event-test@example.invalid')
    returning id into v_customer_id;
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_owner_id, 'role', 'authenticated')::text,
    true
  );

  ---------------------------------------------------------------------------
  -- Open play on Courts 1 and 2 with one paid player.
  ---------------------------------------------------------------------------
  v_session := public.create_open_play_session(
    array[1, 2]::smallint[],
    (v_day + time '10:00') at time zone 'Asia/Manila',
    (v_day + time '12:00') at time zone 'Asia/Manila',
    'Verification open play',
    null
  );
  v_signup := public.create_open_play_signup((v_session ->> 'session_id')::uuid);

  insert into public.payments (open_play_signup_id, gcash_ref, receipt_path)
  values ((v_signup ->> 'signup_id')::uuid, 'TEST123456', 'verification/receipt.jpg');

  -- Non-owners are rejected.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
    true
  );
  v_rejected := false;
  begin
    perform public.remove_open_play_session((v_session ->> 'session_id')::uuid, null);
  exception when others then
    v_rejected := sqlerrm like '%Owner authorization%';
  end;
  if not v_rejected then
    raise exception 'FAIL: non-owner was able to cancel open play';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_owner_id, 'role', 'authenticated')::text,
    true
  );

  v_result := public.remove_open_play_session(
    (v_session ->> 'session_id')::uuid,
    'Verification rain'
  );

  if (v_result ->> 'cancelled_count')::integer <> 1 then
    raise exception 'FAIL: expected 1 cancelled open-play player, got %', v_result;
  end if;

  if exists (
    select 1 from public.open_play_signups
    where id = (v_signup ->> 'signup_id')::uuid and status <> 'cancelled'
  ) then
    raise exception 'FAIL: open-play signup was not cancelled';
  end if;

  if not exists (
    select 1 from public.payments
    where open_play_signup_id = (v_signup ->> 'signup_id')::uuid
      and status = 'refund_pending'
  ) then
    raise exception 'FAIL: open-play payment was not marked for refund';
  end if;

  if exists (
    select 1
    from public.open_play_session_courts allocation
    join public.bookings booking on booking.id = allocation.booking_id
    where allocation.session_id = (v_session ->> 'session_id')::uuid
      and booking.status <> 'cancelled'
  ) or exists (
    select 1 from public.open_play_sessions
    where id = (v_session ->> 'session_id')::uuid and is_published
  ) then
    raise exception 'FAIL: open-play courts were not reopened';
  end if;

  select * into v_notification
  from public.customer_notifications
  where id = (v_result -> 'notification_ids' ->> 0)::uuid;

  if v_notification.id is null
     or v_notification.kind <> 'event_cancelled'
     or v_notification.event_label <> 'Verification open play'
     or v_notification.court_name <> 'Court 1, Court 2'
     or v_notification.reason <> 'Verification rain'
     or v_notification.refund_amount <= 0 then
    raise exception 'FAIL: open-play notification was not queued correctly';
  end if;

  ---------------------------------------------------------------------------
  -- Sunday Unli with one unpaid player.
  ---------------------------------------------------------------------------
  v_sunday := v_day + (7 - extract(isodow from v_day)::integer);

  v_session := public.create_sunday_unli_session(v_sunday, null);
  v_signup := public.create_sunday_unli_signup((v_session ->> 'session_id')::uuid);

  v_result := public.remove_sunday_unli_session(
    (v_session ->> 'session_id')::uuid,
    null
  );

  if (v_result ->> 'cancelled_count')::integer <> 1 then
    raise exception 'FAIL: expected 1 cancelled Sunday Unli player, got %', v_result;
  end if;

  if exists (
    select 1 from public.bookings
    where sunday_unli_session_id = (v_session ->> 'session_id')::uuid
      and status <> 'cancelled'
  ) or exists (
    select 1 from public.sunday_unli_sessions
    where id = (v_session ->> 'session_id')::uuid and status <> 'cancelled'
  ) then
    raise exception 'FAIL: Sunday Unli courts were not reopened';
  end if;

  select * into v_notification
  from public.customer_notifications
  where id = (v_result -> 'notification_ids' ->> 0)::uuid;

  if v_notification.id is null
     or v_notification.kind <> 'event_cancelled'
     or v_notification.event_label <> 'Sunday Unli Play'
     or v_notification.court_name <> 'All courts'
     or v_notification.reason is not null
     or v_notification.refund_amount <> 0 then
    raise exception 'FAIL: Sunday Unli notification was not queued correctly';
  end if;

  raise notice 'PASS: event cancellation verification';
end;
$$;

rollback;
