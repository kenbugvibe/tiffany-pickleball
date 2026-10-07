-- Tiffany's Pickleball Court - query performance verification
-- Run in the Supabase SQL Editor after 202610070023_query_performance.sql.
-- Checks that the faster functions return the same answers. All test rows are
-- rolled back and leave no data behind. No email is sent.

begin;

do $$
declare
  v_owner_id uuid;
  v_customer_id uuid;
  v_day date := (pg_catalog.timezone('Asia/Manila', now()))::date + 404;
  v_booking public.bookings%rowtype;
  v_paid_booking public.bookings%rowtype;
  v_payment_id uuid;
  v_session jsonb;
  v_signup jsonb;
  v_mismatches integer;
  v_status text;
  v_fast bigint;
  v_view bigint;
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
    values (v_owner_id, 'Performance Test Customer', '09170000000', 'performance-test@example.invalid')
    returning id into v_customer_id;
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_owner_id, 'role', 'authenticated')::text,
    true
  );

  ---------------------------------------------------------------------------
  -- A booked slot shows as booked, and the range matches the per-day call.
  ---------------------------------------------------------------------------
  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (v_customer_id, 1,
    (v_day + time '10:00') at time zone 'Asia/Manila',
    (v_day + time '11:00') at time zone 'Asia/Manila', 'regular', 0)
  returning * into v_booking;

  select availability_status into v_status
  from public.get_court_availability(v_day)
  where court_id = 1
    and starts_at = v_booking.starts_at;

  if v_status is distinct from 'booked' then
    raise exception 'FAIL: the booked slot shows as %', v_status;
  end if;

  select pg_catalog.count(*)::integer into v_mismatches
  from (
    (
      select court_id, starts_at, availability_status, court_price
      from public.get_court_availability_range(v_day, 2)
      except
      select court_id, starts_at, availability_status, court_price
      from public.get_court_availability(v_day)
      except
      select court_id, starts_at, availability_status, court_price
      from public.get_court_availability(v_day + 1)
    )
    union all
    (
      select court_id, starts_at, availability_status, court_price
      from public.get_court_availability(v_day)
      except
      select court_id, starts_at, availability_status, court_price
      from public.get_court_availability_range(v_day, 2)
    )
  ) differences;

  if v_mismatches <> 0 then
    raise exception 'FAIL: the week call differs from the per-day call (% rows)', v_mismatches;
  end if;

  ---------------------------------------------------------------------------
  -- My Bookings sees a cancelled event session.
  ---------------------------------------------------------------------------
  v_session := public.create_open_play_session(
    array[2]::smallint[],
    (v_day + time '13:00') at time zone 'Asia/Manila',
    (v_day + time '15:00') at time zone 'Asia/Manila',
    'Verification open play',
    null
  );
  v_signup := public.create_open_play_signup((v_session ->> 'session_id')::uuid);
  perform public.remove_open_play_session((v_session ->> 'session_id')::uuid, null);

  if not exists (
    select 1
    from public.get_my_event_sessions()
    where kind = 'open_play'
      and session_id = (v_session ->> 'session_id')::uuid
      and title = 'Verification open play'
      and court_names = array['Court 2']
  ) then
    raise exception 'FAIL: a cancelled open-play session is missing from My Bookings';
  end if;

  ---------------------------------------------------------------------------
  -- Today's revenue matches the revenue_daily view.
  ---------------------------------------------------------------------------
  insert into public.bookings (customer_id, court_id, starts_at, ends_at, kind, paddle_count)
  values (v_customer_id, 3,
    (v_day + time '16:00') at time zone 'Asia/Manila',
    (v_day + time '17:00') at time zone 'Asia/Manila', 'regular', 0)
  returning * into v_paid_booking;

  insert into public.payments (booking_id, gcash_ref, receipt_path)
  values (v_paid_booking.id, 'TEST400001', 'verification/receipt.jpg')
  returning id into v_payment_id;

  perform public.review_payment(v_payment_id, 'approve');

  v_fast := public.get_owner_collected_for_day(v_day);

  select coalesce(collected, 0) into v_view
  from public.revenue_daily
  where day = v_day;

  if v_fast is distinct from coalesce(v_view, 0) or v_fast <= 0 then
    raise exception 'FAIL: day revenue % does not match revenue_daily %', v_fast, v_view;
  end if;

  raise notice 'PASS: query performance verification';
end;
$$;

rollback;
