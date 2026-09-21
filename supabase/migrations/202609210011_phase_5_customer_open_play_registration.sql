-- Phase 5 - customer open-play registration and payment proof submission.

begin;

create or replace function public.get_open_play_session(p_session_id uuid)
returns table (
  session_id uuid,
  session_reference text,
  title text,
  price_per_player integer,
  customer_note text,
  starts_at timestamptz,
  ends_at timestamptz,
  court_names text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    session.id as session_id,
    session.reference as session_reference,
    session.title,
    session.price_per_player,
    session.customer_note,
    pg_catalog.min(booking.starts_at) as starts_at,
    pg_catalog.max(booking.ends_at) as ends_at,
    pg_catalog.array_agg(court.name order by court.id) as court_names
  from public.open_play_sessions session
  join public.open_play_session_courts allocation
    on allocation.session_id = session.id
  join public.bookings booking
    on booking.id = allocation.booking_id
  join public.courts court
    on court.id = allocation.court_id
  where session.id = p_session_id
    and session.is_published = true
    and booking.kind = 'open_play'
    and booking.status <> 'cancelled'
  group by
    session.id,
    session.reference,
    session.title,
    session.price_per_player,
    session.customer_note;
$$;

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
    if v_existing.status = 'pending'
       and v_existing.payment_proof_submitted_at is null
       and pg_catalog.coalesce(
         v_existing.hold_expires_at,
         '-infinity'::timestamptz
       ) <= pg_catalog.statement_timestamp() then
      update public.open_play_signups
      set status = 'cancelled', hold_expires_at = null
      where id = v_existing.id;
    else
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
        'hold_expires_at', v_existing.hold_expires_at,
        'has_payment', v_has_payment
      );
    end if;
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
    'hold_expires_at', v_signup.hold_expires_at,
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
    and signup.hold_expires_at > pg_catalog.statement_timestamp()
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

revoke all on function public.get_open_play_session(uuid) from public;
revoke all on function public.create_open_play_signup(uuid) from public;
revoke all on function public.submit_open_play_payment(uuid, text, text)
from public;

grant execute on function public.get_open_play_session(uuid)
to anon, authenticated, service_role;
grant execute on function public.create_open_play_signup(uuid)
to authenticated, service_role;
grant execute on function public.submit_open_play_payment(uuid, text, text)
to authenticated, service_role;

commit;
