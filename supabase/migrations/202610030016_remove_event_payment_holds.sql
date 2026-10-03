-- Remove timed payment holds from Open Play and Sunday Unli registrations.
-- Regular court booking holds were removed by the preceding migration.

begin;

create or replace function public.prepare_open_play_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price integer;
begin
  select price_per_player
  into v_price
  from public.open_play_sessions
  where id = new.session_id
    and is_published = true;

  if v_price is null then
    raise exception 'Open-play session is not published';
  end if;

  new.amount_due := v_price;
  new.status := 'pending';
  new.hold_expires_at := null;
  new.payment_proof_submitted_at := null;

  return new;
end;
$$;

create or replace function public.prepare_sunday_unli_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price integer;
begin
  select price_per_player
  into v_price
  from public.sunday_unli_sessions
  where id = new.session_id
    and status = 'published';

  if v_price is null then
    raise exception 'Sunday unli session is not published';
  end if;

  new.amount_due := v_price;
  new.status := 'pending';
  new.hold_expires_at := null;
  new.payment_proof_submitted_at := null;

  return new;
end;
$$;

update public.open_play_signups
set hold_expires_at = null
where status = 'pending'
  and payment_proof_submitted_at is null;

update public.sunday_unli_signups
set hold_expires_at = null
where status = 'pending'
  and payment_proof_submitted_at is null;

create or replace function public.create_open_play_signup(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_starts_at timestamptz;
  v_booking_count integer;
  v_active_booking_count integer;
  v_existing public.open_play_signups%rowtype;
  v_signup public.open_play_signups%rowtype;
  v_has_payment boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select customer.id
  into v_customer_id
  from public.customers customer
  where customer.auth_user_id = (select auth.uid());

  if v_customer_id is null then
    raise exception 'A complete customer profile is required';
  end if;

  perform 1
  from public.open_play_sessions session
  where session.id = p_session_id
    and session.is_published = true
  for update;

  if not found then
    raise exception 'Published open-play session was not found';
  end if;

  perform booking.id
  from public.bookings booking
  join public.open_play_session_courts allocation
    on allocation.booking_id = booking.id
  where allocation.session_id = p_session_id
  order by booking.id
  for update of booking;

  select
    pg_catalog.min(booking.starts_at),
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where booking.kind = 'open_play'
        and booking.status <> 'cancelled'
    )::integer
  into v_starts_at, v_booking_count, v_active_booking_count
  from public.bookings booking
  join public.open_play_session_courts allocation
    on allocation.booking_id = booking.id
  where allocation.session_id = p_session_id;

  if v_booking_count = 0
     or v_active_booking_count <> v_booking_count
     or v_starts_at <= pg_catalog.statement_timestamp() then
    raise exception 'This open-play session is no longer accepting signups';
  end if;

  select signup.*
  into v_existing
  from public.open_play_signups signup
  where signup.session_id = p_session_id
    and signup.customer_id = v_customer_id
    and signup.status <> 'cancelled'
  order by signup.created_at desc
  limit 1
  for update;

  if found then
    select exists (
      select 1
      from public.payments payment
      where payment.open_play_signup_id = v_existing.id
    )
    into v_has_payment;

    return pg_catalog.jsonb_build_object(
      'signup_id', v_existing.id,
      'reference', v_existing.reference,
      'status', v_existing.status,
      'hold_expires_at', null::timestamptz,
      'has_payment', v_has_payment
    );
  end if;

  insert into public.open_play_signups (
    session_id,
    customer_id,
    status
  ) values (
    p_session_id,
    v_customer_id,
    'pending'
  )
  returning * into v_signup;

  return pg_catalog.jsonb_build_object(
    'signup_id', v_signup.id,
    'reference', v_signup.reference,
    'status', v_signup.status,
    'hold_expires_at', null::timestamptz,
    'has_payment', false
  );
end;
$$;

create or replace function public.create_sunday_unli_signup(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_starts_at timestamptz;
  v_booking_count integer;
  v_active_booking_count integer;
  v_existing public.sunday_unli_signups%rowtype;
  v_signup public.sunday_unli_signups%rowtype;
  v_has_payment boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select customer.id
  into v_customer_id
  from public.customers customer
  where customer.auth_user_id = (select auth.uid());

  if v_customer_id is null then
    raise exception 'A complete customer profile is required';
  end if;

  perform 1
  from public.sunday_unli_sessions session
  where session.id = p_session_id
    and session.status = 'published'
  for update;

  if not found then
    raise exception 'Published Sunday-unli session was not found';
  end if;

  perform booking.id
  from public.bookings booking
  where booking.sunday_unli_session_id = p_session_id
  order by booking.id
  for update;

  select
    session.starts_at,
    pg_catalog.count(booking.id)::integer,
    pg_catalog.count(booking.id) filter (
      where booking.kind = 'sunday_unli'
        and booking.status <> 'cancelled'
    )::integer
  into v_starts_at, v_booking_count, v_active_booking_count
  from public.sunday_unli_sessions session
  join public.bookings booking
    on booking.sunday_unli_session_id = session.id
  where session.id = p_session_id
  group by session.starts_at;

  if coalesce(v_booking_count, 0) <> 3
     or v_active_booking_count <> v_booking_count
     or v_starts_at <= pg_catalog.statement_timestamp() then
    raise exception 'This Sunday-unli session is no longer accepting signups';
  end if;

  select signup.*
  into v_existing
  from public.sunday_unli_signups signup
  where signup.session_id = p_session_id
    and signup.customer_id = v_customer_id
    and signup.status <> 'cancelled'
  order by signup.created_at desc
  limit 1
  for update;

  if found then
    select exists (
      select 1
      from public.payments payment
      where payment.sunday_unli_signup_id = v_existing.id
    )
    into v_has_payment;

    return pg_catalog.jsonb_build_object(
      'signup_id', v_existing.id,
      'reference', v_existing.reference,
      'status', v_existing.status,
      'hold_expires_at', null::timestamptz,
      'has_payment', v_has_payment
    );
  end if;

  insert into public.sunday_unli_signups (
    session_id,
    customer_id,
    status
  ) values (
    p_session_id,
    v_customer_id,
    'pending'
  )
  returning * into v_signup;

  return pg_catalog.jsonb_build_object(
    'signup_id', v_signup.id,
    'reference', v_signup.reference,
    'status', v_signup.status,
    'hold_expires_at', null::timestamptz,
    'has_payment', false
  );
end;
$$;

create or replace function public.submit_open_play_payment(
  p_signup_id uuid,
  p_gcash_ref text,
  p_receipt_path text
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
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_gcash_ref is null
     or pg_catalog.btrim(p_gcash_ref) !~ '^[0-9]{6,30}$' then
    raise exception 'A valid GCash reference is required';
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

  perform 1
  from public.open_play_signups signup
  join public.customers customer on customer.id = signup.customer_id
  where signup.id = p_signup_id
    and customer.auth_user_id = (select auth.uid())
    and signup.status = 'pending'
    and signup.payment_proof_submitted_at is null
  for update of signup;

  if not found then
    raise exception 'Open-play signup is not awaiting payment';
  end if;

  insert into public.payments (
    open_play_signup_id,
    gcash_ref,
    receipt_path
  ) values (
    p_signup_id,
    pg_catalog.btrim(p_gcash_ref),
    p_receipt_path
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

create or replace function public.submit_sunday_unli_payment(
  p_signup_id uuid,
  p_gcash_ref text,
  p_receipt_path text
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
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_gcash_ref is null
     or pg_catalog.btrim(p_gcash_ref) !~ '^[0-9]{6,30}$' then
    raise exception 'A valid GCash reference is required';
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

  perform 1
  from public.sunday_unli_signups signup
  join public.customers customer on customer.id = signup.customer_id
  where signup.id = p_signup_id
    and customer.auth_user_id = (select auth.uid())
    and signup.status = 'pending'
    and signup.payment_proof_submitted_at is null
  for update of signup;

  if not found then
    raise exception 'Sunday-unli signup is not awaiting payment';
  end if;

  insert into public.payments (
    sunday_unli_signup_id,
    gcash_ref,
    receipt_path
  ) values (
    p_signup_id,
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
      and status = 'pending';

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
      and status = 'pending';

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

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname in (
      'tiffany-expire-payment-holds',
      'tiffany-prune-cron-history'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

drop function if exists public.expire_payment_holds();

commit;
