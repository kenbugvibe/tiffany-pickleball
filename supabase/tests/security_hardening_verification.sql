-- Tiffany's Pickleball Court - security hardening verification
-- Run in the Supabase SQL Editor after 202610070022_security_hardening.sql.
-- Creates a temporary test customer. Everything is rolled back and leaves no
-- data behind. No email is sent.

begin;

do $$
declare
  v_owner_id uuid;
  v_test_user_id uuid := gen_random_uuid();
  v_customer_id uuid;
  v_day date := (pg_catalog.timezone('Asia/Manila', now()))::date + 59;
  v_first public.bookings%rowtype;
  v_second public.bookings%rowtype;
  v_result jsonb;
  v_notification public.customer_notifications%rowtype;
  v_rejected boolean;
begin
  select user_id into v_owner_id from public.admin_users limit 1;

  if v_owner_id is null then
    raise exception 'Run supabase/setup_owner.sql before this verification';
  end if;

  -- A throwaway customer account. The signup trigger creates its profile.
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_test_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'security-test-' || v_test_user_id || '@example.invalid',
    jsonb_build_object(
      'account_type', 'customer',
      'full_name', 'Security Test Customer',
      'phone', '09170000001'
    ),
    now(),
    now()
  );

  select id into v_customer_id
  from public.customers
  where auth_user_id = v_test_user_id;

  if v_customer_id is null then
    raise exception 'FAIL: test customer profile was not created';
  end if;

  -- Act as the test customer.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_test_user_id, 'role', 'authenticated')::text,
    true
  );

  ---------------------------------------------------------------------------
  -- Customers can hold at most 2 unpaid bookings.
  ---------------------------------------------------------------------------
  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (v_customer_id, 1,
    (v_day + time '08:00') at time zone 'Asia/Manila',
    (v_day + time '09:00') at time zone 'Asia/Manila', 'regular', 0)
  returning * into v_first;

  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (v_customer_id, 2,
    (v_day + time '08:00') at time zone 'Asia/Manila',
    (v_day + time '09:00') at time zone 'Asia/Manila', 'regular', 0)
  returning * into v_second;

  v_rejected := false;
  begin
    insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
    values (v_customer_id, 3,
      (v_day + time '08:00') at time zone 'Asia/Manila',
      (v_day + time '09:00') at time zone 'Asia/Manila', 'regular', 0);
  exception when sqlstate 'TP001' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL: a third unpaid booking was allowed';
  end if;

  ---------------------------------------------------------------------------
  -- Paddle and date limits.
  ---------------------------------------------------------------------------
  v_rejected := false;
  begin
    insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
    values (v_customer_id, 3,
      (v_day + time '11:00') at time zone 'Asia/Manila',
      (v_day + time '12:00') at time zone 'Asia/Manila', 'regular', 9);
  exception when sqlstate 'TP003' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL: 9 paddles were allowed';
  end if;

  v_rejected := false;
  begin
    insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
    values (v_customer_id, 3,
      (v_day + 30 + time '11:00') at time zone 'Asia/Manila',
      (v_day + 30 + time '12:00') at time zone 'Asia/Manila', 'regular', 0);
  exception when sqlstate 'TP002' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL: a booking more than 60 days ahead was allowed';
  end if;

  ---------------------------------------------------------------------------
  -- Uploading a receipt frees one unpaid slot.
  ---------------------------------------------------------------------------
  insert into public.payments (booking_id, gcash_ref, receipt_path)
  values (v_first.id, 'TEST300001', v_test_user_id || '/verification/receipt.jpg');

  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (v_customer_id, 3,
    (v_day + time '08:00') at time zone 'Asia/Manila',
    (v_day + time '09:00') at time zone 'Asia/Manila', 'regular', 0);

  ---------------------------------------------------------------------------
  -- Customers can no longer insert payments directly.
  ---------------------------------------------------------------------------
  if pg_catalog.has_table_privilege('authenticated', 'public.payments', 'INSERT') then
    raise exception 'FAIL: authenticated users can still insert payments';
  end if;

  ---------------------------------------------------------------------------
  -- Length limits.
  ---------------------------------------------------------------------------
  v_rejected := false;
  begin
    update public.payments
    set gcash_ref = pg_catalog.repeat('1', 65)
    where booking_id = v_first.id;
  exception when check_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL: a 65-character GCash reference was allowed';
  end if;

  ---------------------------------------------------------------------------
  -- The owner cancels an unpaid booking; paid ones are refused.
  ---------------------------------------------------------------------------
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_owner_id, 'role', 'authenticated')::text,
    true
  );

  v_rejected := false;
  begin
    perform public.cancel_unpaid_booking(v_first.id, null);
  exception when others then
    v_rejected := sqlerrm like '%has a receipt%';
  end;
  if not v_rejected then
    raise exception 'FAIL: a booking with a receipt was cancelled as unpaid';
  end if;

  v_result := public.cancel_unpaid_booking(v_second.id, 'No payment received');

  if not exists (
    select 1 from public.bookings
    where id = v_second.id and status = 'cancelled'
  ) then
    raise exception 'FAIL: the unpaid booking was not cancelled';
  end if;

  select * into v_notification
  from public.customer_notifications
  where id = (v_result ->> 'notification_id')::uuid;

  if v_notification.id is null
     or v_notification.kind <> 'unpaid_cancelled'
     or v_notification.booking_reference <> v_second.reference
     or v_notification.reason <> 'No payment received' then
    raise exception 'FAIL: the unpaid cancellation notice was not queued correctly';
  end if;

  -- Non-owners cannot use it.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_test_user_id, 'role', 'authenticated')::text,
    true
  );
  v_rejected := false;
  begin
    perform public.cancel_unpaid_booking(v_first.id, null);
  exception when others then
    v_rejected := sqlerrm like '%Owner authorization%';
  end;
  if not v_rejected then
    raise exception 'FAIL: a customer was able to call cancel_unpaid_booking';
  end if;

  raise notice 'PASS: security hardening verification';
end;
$$;

rollback;
