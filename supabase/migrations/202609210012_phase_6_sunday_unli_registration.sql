-- Phase 6 - owner Sunday-unli publishing and customer registration.

begin;

create or replace function public.create_sunday_unli_session(
  p_session_date date,
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_price integer;
  v_customer_note text;
  v_court_ids smallint[];
  v_court_id smallint;
  v_booking_id uuid;
  v_booking_ids uuid[] := array[]::uuid[];
  v_session_id uuid;
  v_session_reference text;
begin
  if (select auth.uid()) is null
     or not exists (
       select 1
       from public.admin_users
       where user_id = (select auth.uid())
     ) then
    raise exception 'Owner authorization is required'
      using errcode = '42501';
  end if;

  if p_session_date is null
     or extract(isodow from p_session_date) <> 7 then
    raise exception 'Sunday unli must be published on a Sunday';
  end if;

  v_starts_at := (p_session_date + time '19:00') at time zone 'Asia/Manila';
  v_ends_at := (p_session_date + interval '1 day')::timestamp
    at time zone 'Asia/Manila';

  if v_starts_at <= pg_catalog.statement_timestamp() then
    raise exception 'Choose a future Sunday-unli session';
  end if;

  v_customer_note := nullif(
    pg_catalog.btrim(coalesce(p_customer_note, '')),
    ''
  );

  if pg_catalog.length(coalesce(v_customer_note, '')) > 500 then
    raise exception 'Customer note must be 500 characters or fewer';
  end if;

  select settings.sunday_unli_price
  into v_price
  from public.business_settings settings
  where settings.id = 1;

  select pg_catalog.array_agg(court.id order by court.id)
  into v_court_ids
  from public.courts court
  where court.is_active = true;

  if v_price is null or v_price <= 0 then
    raise exception 'Sunday-unli pricing is not configured';
  end if;

  if coalesce(pg_catalog.cardinality(v_court_ids), 0) <> 3 then
    raise exception 'Sunday unli requires exactly three active courts';
  end if;

  begin
    insert into public.sunday_unli_sessions (
      starts_at,
      ends_at,
      price_per_player,
      status,
      customer_note
    ) values (
      v_starts_at,
      v_ends_at,
      v_price,
      'published',
      v_customer_note
    )
    returning id, reference into v_session_id, v_session_reference;

    foreach v_court_id in array v_court_ids loop
      insert into public.bookings (
        court_id,
        sunday_unli_session_id,
        starts_at,
        ends_at,
        kind,
        status,
        internal_note
      ) values (
        v_court_id,
        v_session_id,
        v_starts_at,
        v_ends_at,
        'sunday_unli',
        'confirmed',
        'Published from the owner calendar'
      )
      returning id into v_booking_id;

      v_booking_ids := pg_catalog.array_append(v_booking_ids, v_booking_id);
    end loop;
  exception
    when exclusion_violation then
      raise exception 'One or more courts are no longer available for Sunday unli';
  end;

  return pg_catalog.jsonb_build_object(
    'session_id', v_session_id,
    'session_reference', v_session_reference,
    'booking_ids', pg_catalog.to_jsonb(v_booking_ids),
    'court_ids', pg_catalog.to_jsonb(v_court_ids),
    'price_per_player', v_price
  );
end;
$$;

create or replace function public.remove_sunday_unli_session(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference text;
begin
  if (select auth.uid()) is null
     or not exists (
       select 1
       from public.admin_users
       where user_id = (select auth.uid())
     ) then
    raise exception 'Owner authorization is required'
      using errcode = '42501';
  end if;

  select session.reference
  into v_reference
  from public.sunday_unli_sessions session
  where session.id = p_session_id
    and session.status = 'published'
    and session.ends_at > pg_catalog.statement_timestamp()
  for update;

  if not found then
    raise exception 'An active or upcoming Sunday-unli session was not found';
  end if;

  perform booking.id
  from public.bookings booking
  where booking.sunday_unli_session_id = p_session_id
    and booking.status <> 'cancelled'
  order by booking.id
  for update;

  if exists (
    select 1
    from public.sunday_unli_signups signup
    where signup.session_id = p_session_id
      and signup.status <> 'cancelled'
  ) then
    raise exception 'This Sunday-unli session has active participants and cannot be removed';
  end if;

  update public.sunday_unli_sessions
  set status = 'cancelled'
  where id = p_session_id;

  update public.bookings
  set
    status = 'cancelled',
    internal_note = case
      when internal_note is null or pg_catalog.btrim(internal_note) = ''
        then 'Sunday unli removed from the owner calendar'
      else internal_note || E'\nSunday unli removed from the owner calendar'
    end
  where sunday_unli_session_id = p_session_id
    and status <> 'cancelled';

  return v_reference;
end;
$$;

create or replace function public.get_sunday_unli_session(p_session_id uuid)
returns table (
  session_id uuid,
  session_reference text,
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
    session.price_per_player,
    session.customer_note,
    session.starts_at,
    session.ends_at,
    pg_catalog.array_agg(court.name order by court.id) as court_names
  from public.sunday_unli_sessions session
  join public.bookings booking
    on booking.sunday_unli_session_id = session.id
  join public.courts court
    on court.id = booking.court_id
  where session.id = p_session_id
    and session.status = 'published'
    and booking.kind = 'sunday_unli'
    and booking.status <> 'cancelled'
  group by
    session.id,
    session.reference,
    session.price_per_player,
    session.customer_note,
    session.starts_at,
    session.ends_at;
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
    if v_existing.status = 'pending'
       and v_existing.payment_proof_submitted_at is null
       and coalesce(
         v_existing.hold_expires_at,
         '-infinity'::timestamptz
       ) <= pg_catalog.statement_timestamp() then
      update public.sunday_unli_signups
      set status = 'cancelled', hold_expires_at = null
      where id = v_existing.id;
    else
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
        'hold_expires_at', v_existing.hold_expires_at,
        'has_payment', v_has_payment
      );
    end if;
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
    'hold_expires_at', v_signup.hold_expires_at,
    'has_payment', false
  );
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
    and signup.hold_expires_at > pg_catalog.statement_timestamp()
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

revoke all on function public.create_sunday_unli_session(date, text) from public;
revoke all on function public.remove_sunday_unli_session(uuid) from public;
revoke all on function public.get_sunday_unli_session(uuid) from public;
revoke all on function public.create_sunday_unli_signup(uuid) from public;
revoke all on function public.submit_sunday_unli_payment(uuid, text, text)
from public;

grant execute on function public.create_sunday_unli_session(date, text)
to authenticated, service_role;
grant execute on function public.remove_sunday_unli_session(uuid)
to authenticated, service_role;
grant execute on function public.get_sunday_unli_session(uuid)
to anon, authenticated, service_role;
grant execute on function public.create_sunday_unli_signup(uuid)
to authenticated, service_role;
grant execute on function public.submit_sunday_unli_payment(uuid, text, text)
to authenticated, service_role;

commit;
