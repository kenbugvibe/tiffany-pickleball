-- Tiffany's Pickleball Court - Phase 1 verification
-- Run only after the Phase 1 migration succeeds.
-- All test rows are rolled back and leave no data behind.

begin;

set local timezone = 'Asia/Manila';

do $$
declare
  v_auth_user_id uuid;
  v_customer_id uuid;
  v_booking_id uuid;
  v_payment_id uuid;
  v_open_play_booking_id uuid;
  v_open_play_session_id uuid;
  v_open_play_signup_id uuid;
  v_open_play_payment_id uuid;
  v_unli_session_id uuid;
  v_unli_signup_id uuid;
  v_unli_payment_id uuid;
  v_recurring_rule_id uuid;
  v_expiring_booking_id uuid;
  v_expired_booking_count integer;
  v_court_fee integer;
  v_paddle_fee integer;
  v_total integer;
  v_overlap_rejected boolean := false;
  v_recurring_conflict_rejected boolean := false;
  v_walk_in_rejected boolean := false;
  v_collected bigint;
  v_booking_count bigint;
  v_court_hours numeric;
  v_open_play_heads bigint;
  v_sunday_unli_heads bigint;
  v_availability_rows integer;
  v_booked_rows integer;
  v_open_play_rows integer;
  v_sunday_unli_rows integer;
  v_missing_rls integer;
  v_missing_policy integer;
begin
  select id
  into v_auth_user_id
  from auth.users
  order by created_at
  limit 1;

  if v_auth_user_id is null then
    raise exception 'Create the owner Auth user before running Phase 1 verification';
  end if;

  if not exists (
    select 1
    from public.admin_users
    where user_id = v_auth_user_id
  ) then
    raise exception 'Run supabase/setup_owner.sql before Phase 1 verification';
  end if;

  select id
  into v_customer_id
  from public.customers
  where auth_user_id = v_auth_user_id;

  if v_customer_id is null then
    insert into public.customers (
      auth_user_id,
      full_name,
      phone,
      email
    )
    values (
      v_auth_user_id,
      'Phase One Test Customer',
      '09170000000',
      'phase-one-test@example.invalid'
    )
    returning id into v_customer_id;
  end if;

  insert into public.bookings (
    customer_id,
    court_id,
    starts_at,
    ends_at,
    kind,
    paddle_count
  )
  values (
    v_customer_id,
    1,
    timestamptz '2099-09-13 10:00:00+08',
    timestamptz '2099-09-13 13:00:00+08',
    'regular',
    1
  )
  returning id, court_fee, paddle_fee, total_amount
  into v_booking_id, v_court_fee, v_paddle_fee, v_total;

  if v_court_fee <> 650 or v_paddle_fee <> 150 or v_total <> 800 then
    raise exception
      'Pricing failed: expected 650 court + 150 paddle = 800, got % + % = %',
      v_court_fee,
      v_paddle_fee,
      v_total;
  end if;

  if not exists (
    select 1
    from public.bookings
    where id = v_booking_id
      and hold_expires_at between
        pg_catalog.clock_timestamp() + interval '29 minutes'
        and pg_catalog.clock_timestamp() + interval '31 minutes'
      and payment_proof_submitted_at is null
  ) then
    raise exception 'The initial 30-minute payment hold was not created correctly';
  end if;

  begin
    insert into public.bookings (
      customer_id,
      court_id,
      starts_at,
      ends_at,
      kind,
      paddle_count
    )
    values (
      v_customer_id,
      1,
      timestamptz '2099-09-13 11:00:00+08',
      timestamptz '2099-09-13 12:00:00+08',
      'regular',
      0
    );
  exception
    when exclusion_violation then
      v_overlap_rejected := true;
  end;

  if not v_overlap_rejected then
    raise exception 'Overlap protection failed: conflicting booking was accepted';
  end if;

  begin
    insert into public.bookings (
      customer_id,
      court_id,
      starts_at,
      ends_at,
      kind
    )
    values (
      v_customer_id,
      3,
      timestamptz '2099-09-13 08:00:00+08',
      timestamptz '2099-09-13 09:00:00+08',
      'walk_in'
    );
  exception
    when check_violation then
      v_walk_in_rejected := true;
  end;

  if not v_walk_in_rejected then
    raise exception 'Walk-in removal failed: a walk_in booking kind was accepted';
  end if;

  insert into public.payments (
    booking_id,
    gcash_ref,
    receipt_path
  )
  values (
    v_booking_id,
    'PHASE1-TEST-REF',
    'phase-one-test/example.webp'
  )
  returning id, amount into v_payment_id, v_total;

  if v_total <> 800 then
    raise exception 'Payment amount failed: expected 800, got %', v_total;
  end if;

  if exists (
    select 1
    from public.bookings
    where id = v_booking_id
      and (hold_expires_at is not null or payment_proof_submitted_at is null)
  ) then
    raise exception 'Receipt submission failed to preserve the pending booking correctly';
  end if;

  update public.bookings
  set status = 'confirmed'
  where id = v_booking_id;

  update public.payments
  set status = 'verified', verified_at = now()
  where id = v_payment_id;

  insert into public.bookings (
    court_id,
    starts_at,
    ends_at,
    kind
  )
  values (
    2,
    timestamptz '2099-09-13 16:00:00+08',
    timestamptz '2099-09-13 18:00:00+08',
    'open_play'
  )
  returning id into v_open_play_booking_id;

  insert into public.open_play_sessions (
    booking_id,
    is_published
  )
  values (
    v_open_play_booking_id,
    true
  )
  returning id into v_open_play_session_id;

  insert into public.open_play_signups (
    session_id,
    customer_id
  )
  values (
    v_open_play_session_id,
    v_customer_id
  )
  returning id, amount_due into v_open_play_signup_id, v_total;

  if v_total is distinct from 120 then
    raise exception 'Open-play price failed: expected 120, got %', v_total;
  end if;

  insert into public.payments (
    open_play_signup_id,
    gcash_ref,
    receipt_path
  )
  values (
    v_open_play_signup_id,
    'PHASE1-OPEN-PLAY-REF',
    'phase-one-test/open-play.webp'
  )
  returning id into v_open_play_payment_id;

  update public.bookings
  set status = 'confirmed'
  where id = v_open_play_booking_id;

  update public.open_play_signups
  set status = 'confirmed'
  where id = v_open_play_signup_id;

  update public.payments
  set status = 'verified', verified_at = now()
  where id = v_open_play_payment_id;

  insert into public.sunday_unli_sessions (
    starts_at,
    ends_at,
    status
  )
  values (
    timestamptz '2099-09-13 19:00:00+08',
    timestamptz '2099-09-14 00:00:00+08',
    'published'
  )
  returning id into v_unli_session_id;

  insert into public.bookings (
    court_id,
    sunday_unli_session_id,
    starts_at,
    ends_at,
    kind,
    status
  )
  select
    court_id::smallint,
    v_unli_session_id,
    timestamptz '2099-09-13 19:00:00+08',
    timestamptz '2099-09-14 00:00:00+08',
    'sunday_unli',
    'confirmed'
  from generate_series(1, 3) as court_ids(court_id);

  insert into public.sunday_unli_signups (
    session_id,
    customer_id
  )
  values (
    v_unli_session_id,
    v_customer_id
  )
  returning id, amount_due into v_unli_signup_id, v_total;

  if v_total is distinct from 120 then
    raise exception 'Sunday unli price failed: expected 120, got %', v_total;
  end if;

  insert into public.payments (
    sunday_unli_signup_id,
    gcash_ref,
    receipt_path
  )
  values (
    v_unli_signup_id,
    'PHASE1-UNLI-REF',
    'phase-one-test/unli.webp'
  )
  returning id into v_unli_payment_id;

  update public.sunday_unli_signups
  set status = 'confirmed'
  where id = v_unli_signup_id;

  update public.payments
  set status = 'verified', verified_at = now()
  where id = v_unli_payment_id;

  insert into public.recurring_bookings (
    customer_id,
    court_id,
    weekday,
    start_hour,
    duration_hrs,
    valid_from
  )
  values (
    v_customer_id,
    1,
    0,
    10,
    1,
    date '2099-09-13'
  )
  returning id into v_recurring_rule_id;

  begin
    insert into public.bookings (
      customer_id,
      court_id,
      starts_at,
      ends_at,
      kind,
      recurring_rule_id,
      status
    )
    values (
      v_customer_id,
      1,
      timestamptz '2099-09-13 10:00:00+08',
      timestamptz '2099-09-13 11:00:00+08',
      'recurring',
      v_recurring_rule_id,
      'confirmed'
    );
  exception
    when exclusion_violation then
      v_recurring_conflict_rejected := true;
  end;

  if not v_recurring_conflict_rejected then
    raise exception 'Recurring conflict failed: an existing booking was overwritten';
  end if;

  insert into public.recurring_booking_skips (
    recurring_rule_id,
    occurrence_date,
    reason
  )
  values (
    v_recurring_rule_id,
    date '2099-09-13',
    'conflict'
  );

  insert into public.bookings (
    customer_id,
    court_id,
    starts_at,
    ends_at,
    kind
  )
  values (
    v_customer_id,
    3,
    timestamptz '2099-09-13 14:00:00+08',
    timestamptz '2099-09-13 15:00:00+08',
    'regular'
  )
  returning id into v_expiring_booking_id;

  update public.bookings
  set hold_expires_at = pg_catalog.statement_timestamp() - interval '1 minute'
  where id = v_expiring_booking_id;

  select bookings_cancelled
  into v_expired_booking_count
  from public.expire_payment_holds();

  if v_expired_booking_count < 1 or not exists (
    select 1
    from public.bookings
    where id = v_expiring_booking_id
      and status = 'cancelled'
  ) then
    raise exception 'Expired-hold cleanup failed';
  end if;

  select
    collected,
    booking_count,
    court_hours,
    open_play_heads,
    sunday_unli_heads
  into
    v_collected,
    v_booking_count,
    v_court_hours,
    v_open_play_heads,
    v_sunday_unli_heads
  from public.revenue_daily
  where day = date '2099-09-13';

  if v_collected is distinct from 1040
     or v_booking_count is distinct from 1
     or v_court_hours is distinct from 3
     or v_open_play_heads is distinct from 1
     or v_sunday_unli_heads is distinct from 1 then
    raise exception
      'Revenue failed: expected 1040, 1 booking, 3 hours, 1 open-play head, 1 unli head; got %, %, %, %, %',
      v_collected,
      v_booking_count,
      v_court_hours,
      v_open_play_heads,
      v_sunday_unli_heads;
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where court_id = 1 and availability_status = 'booked'
    )::integer,
    count(*) filter (
      where court_id = 2 and availability_status = 'open_play'
    )::integer,
    count(*) filter (
      where availability_status = 'sunday_unli'
    )::integer
  into
    v_availability_rows,
    v_booked_rows,
    v_open_play_rows,
    v_sunday_unli_rows
  from public.get_court_availability(date '2099-09-13');

  if v_availability_rows is distinct from 48
     or v_booked_rows is distinct from 3
     or v_open_play_rows is distinct from 2
     or v_sunday_unli_rows is distinct from 15 then
    raise exception
      'Availability failed: expected 48 total, 3 booked, 2 open play, 15 unli; got %, %, %, %',
      v_availability_rows,
      v_booked_rows,
      v_open_play_rows,
      v_sunday_unli_rows;
  end if;

  select count(*)::integer
  into v_missing_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'business_settings',
      'courts',
      'rate_blocks',
      'customers',
      'admin_users',
      'sunday_unli_sessions',
      'bookings',
      'open_play_sessions',
      'open_play_signups',
      'sunday_unli_signups',
      'payments',
      'recurring_bookings',
      'recurring_booking_skips'
    )
    and c.relkind = 'r'
    and c.relrowsecurity = false;

  if v_missing_rls <> 0 then
    raise exception 'RLS verification failed: % public tables are missing RLS', v_missing_rls;
  end if;

  select count(*)::integer
  into v_missing_policy
  from (
    select unnest(array[
      'business_settings',
      'courts',
      'rate_blocks',
      'customers',
      'admin_users',
      'sunday_unli_sessions',
      'bookings',
      'open_play_sessions',
      'open_play_signups',
      'sunday_unli_signups',
      'payments',
      'recurring_bookings',
      'recurring_booking_skips'
    ]) as table_name
  ) expected
  where not exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = expected.table_name
  );

  if v_missing_policy <> 0 then
    raise exception 'RLS policy verification failed: % public tables have no policy', v_missing_policy;
  end if;
end;
$$;

select 'PASS - pricing, overlap, products, holds, revenue, availability, and RLS checks succeeded' as phase_1_result;

rollback;
