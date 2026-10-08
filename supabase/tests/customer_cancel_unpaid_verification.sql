-- Tiffany's Pickleball Court - customer cancel-unpaid verification
-- Run in the Supabase SQL Editor after 202610080024_customer_cancel_unpaid.sql.
-- Creates a temporary test customer. Everything is rolled back and leaves no
-- data behind.

begin;

do $$
declare
  v_test_user_id uuid := gen_random_uuid();
  v_other_user_id uuid := gen_random_uuid();
  v_customer_id uuid;
  v_day date := (pg_catalog.timezone('Asia/Manila', now()))::date + 58;
  v_unpaid public.bookings%rowtype;
  v_paid public.bookings%rowtype;
  v_reference text;
  v_rejected boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (v_test_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
     'authenticated', 'cancel-test-' || v_test_user_id || '@example.invalid', now(), now()),
    (v_other_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
     'authenticated', 'cancel-other-' || v_other_user_id || '@example.invalid', now(), now());

  insert into public.customers (auth_user_id, full_name, phone, email)
  values (v_test_user_id, 'Cancel Test Customer', '09170000002',
          'cancel-test-' || v_test_user_id || '@example.invalid')
  returning id into v_customer_id;

  insert into public.customers (auth_user_id, full_name, phone, email)
  values (v_other_user_id, 'Other Test Customer', '09170000003',
          'cancel-other-' || v_other_user_id || '@example.invalid');

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_test_user_id, 'role', 'authenticated')::text,
    true
  );

  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (v_customer_id, 1,
    (v_day + time '08:00') at time zone 'Asia/Manila',
    (v_day + time '09:00') at time zone 'Asia/Manila', 'regular', 0)
  returning * into v_unpaid;

  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (v_customer_id, 2,
    (v_day + time '08:00') at time zone 'Asia/Manila',
    (v_day + time '09:00') at time zone 'Asia/Manila', 'regular', 0)
  returning * into v_paid;

  insert into public.payments (booking_id, gcash_ref, receipt_path)
  values (v_paid.id, 'TEST500001', v_test_user_id || '/verification/receipt.jpg');

  -- Another customer cannot cancel it.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_other_user_id, 'role', 'authenticated')::text,
    true
  );
  v_rejected := false;
  begin
    perform public.cancel_my_unpaid_booking(v_unpaid.id);
  exception when others then
    v_rejected := sqlerrm like '%your own pending%';
  end;
  if not v_rejected then
    raise exception 'FAIL: another customer cancelled the booking';
  end if;

  -- The owner of the booking can cancel it.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_test_user_id, 'role', 'authenticated')::text,
    true
  );
  v_reference := public.cancel_my_unpaid_booking(v_unpaid.id);

  if v_reference <> v_unpaid.reference or not exists (
    select 1 from public.bookings where id = v_unpaid.id and status = 'cancelled'
  ) then
    raise exception 'FAIL: the unpaid booking was not cancelled';
  end if;

  -- A booking with a receipt cannot be cancelled this way.
  v_rejected := false;
  begin
    perform public.cancel_my_unpaid_booking(v_paid.id);
  exception when others then
    v_rejected := sqlerrm like '%has a receipt%';
  end;
  if not v_rejected then
    raise exception 'FAIL: a booking with a receipt was cancelled';
  end if;

  raise notice 'PASS: customer cancel-unpaid verification';
end;
$$;

rollback;
