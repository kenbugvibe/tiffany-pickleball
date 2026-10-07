-- Query performance fixes from the October 7, 2026 audit.
--
-- 1. Court availability uses the existing overlap index instead of scanning
--    every past booking, and a whole week loads in one call.
-- 2. My Bookings loads all of the customer's event sessions in one call. This
--    also returns cancelled sessions, which previously broke the page.
-- 3. Today's collected revenue sums one day instead of all history.
-- 4. Indexes for the customer signup lookups.

begin;

---------------------------------------------------------------------------
-- 1. Availability
-- The overlap test is written as tstzrange && tstzrange with
-- status <> 'cancelled' so it matches the active_bookings_do_not_overlap
-- GiST index (court_id, tstzrange(starts_at, ends_at, '[)')).
---------------------------------------------------------------------------
create or replace function public.get_court_availability(p_day date)
returns table (
  court_id smallint,
  court_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  court_price integer,
  availability_status text,
  entry_id uuid,
  entry_price integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with slots as (
    select
      c.id as court_id,
      c.name as court_name,
      (
        p_day::timestamp + pg_catalog.make_interval(hours => slot_hour)
      ) at time zone 'Asia/Manila' as starts_at,
      (
        p_day::timestamp + pg_catalog.make_interval(hours => slot_hour + 1)
      ) at time zone 'Asia/Manila' as ends_at,
      slot_hour
    from public.courts c
    cross join public.business_settings settings
    cross join lateral pg_catalog.generate_series(
      settings.opening_hour::integer,
      settings.closing_hour::integer - 1
    ) as hours(slot_hour)
    where c.is_active = true
  )
  select
    slots.court_id,
    slots.court_name,
    slots.starts_at,
    slots.ends_at,
    rb.price_per_hour as court_price,
    case
      when occupied.id is null then 'available'
      when occupied.kind in ('regular', 'recurring') then 'booked'
      when occupied.kind = 'blocked' then 'blocked'
      when occupied.kind = 'open_play' and op.is_published then 'open_play'
      when occupied.kind = 'sunday_unli' and su.status = 'published' then 'sunday_unli'
      else 'booked'
    end as availability_status,
    case
      when occupied.kind = 'open_play' and op.is_published then op.id
      when occupied.kind = 'sunday_unli' and su.status = 'published' then su.id
      else null
    end as entry_id,
    case
      when occupied.kind = 'open_play' and op.is_published then op.price_per_player
      when occupied.kind = 'sunday_unli' and su.status = 'published' then su.price_per_player
      else null
    end as entry_price
  from slots
  join public.rate_blocks rb
    on slots.slot_hour >= rb.start_hour
    and slots.slot_hour < rb.end_hour
  left join lateral (
    select b.id, b.kind, b.sunday_unli_session_id
    from public.bookings b
    where b.court_id = slots.court_id
      and b.status <> 'cancelled'
      and pg_catalog.tstzrange(b.starts_at, b.ends_at, '[)')
        && pg_catalog.tstzrange(slots.starts_at, slots.ends_at, '[)')
    limit 1
  ) occupied on true
  left join public.open_play_session_courts allocation
    on allocation.booking_id = occupied.id
  left join public.open_play_sessions op
    on op.id = allocation.session_id
  left join public.sunday_unli_sessions su
    on su.id = occupied.sunday_unli_session_id
  order by slots.starts_at, slots.court_id;
$$;

-- One call for several consecutive days (the homepage shows a week).
create or replace function public.get_court_availability_range(
  p_from date,
  p_days integer
)
returns table (
  day date,
  court_id smallint,
  court_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  court_price integer,
  availability_status text,
  entry_id uuid,
  entry_price integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    requested.day,
    availability.court_id,
    availability.court_name,
    availability.starts_at,
    availability.ends_at,
    availability.court_price,
    availability.availability_status,
    availability.entry_id,
    availability.entry_price
  from (
    select (p_from + offset_days)::date as day
    from pg_catalog.generate_series(
      0,
      least(greatest(coalesce(p_days, 1), 1), 14) - 1
    ) as series(offset_days)
  ) requested
  cross join lateral public.get_court_availability(requested.day) availability
  order by requested.day, availability.starts_at, availability.court_id;
$$;

revoke all on function public.get_court_availability_range(date, integer) from public;

grant execute on function public.get_court_availability_range(date, integer)
to anon, authenticated, service_role;

---------------------------------------------------------------------------
-- 2. My Bookings event sessions in one call
-- Returns only sessions the caller has registered for, including cancelled
-- or unpublished ones, so past registrations always display.
---------------------------------------------------------------------------
create or replace function public.get_my_event_sessions()
returns table (
  kind text,
  session_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  court_names text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select public.current_customer_id() as customer_id
  )
  select
    'open_play'::text as kind,
    session.id as session_id,
    session.title,
    primary_booking.starts_at,
    primary_booking.ends_at,
    coalesce(
      (
        select pg_catalog.array_agg(court.name order by court.id)
        from public.open_play_session_courts allocation
        join public.courts court on court.id = allocation.court_id
        where allocation.session_id = session.id
      ),
      array[primary_court.name]
    ) as court_names
  from public.open_play_sessions session
  join public.bookings primary_booking
    on primary_booking.id = session.booking_id
  join public.courts primary_court
    on primary_court.id = primary_booking.court_id
  where session.id in (
    select signup.session_id
    from public.open_play_signups signup
    where signup.customer_id = (select customer_id from me)
  )

  union all

  select
    'sunday_unli'::text as kind,
    session.id as session_id,
    'Sunday Unli Play'::text as title,
    session.starts_at,
    session.ends_at,
    coalesce(
      (
        select pg_catalog.array_agg(court.name order by court.id)
        from public.bookings booking
        join public.courts court on court.id = booking.court_id
        where booking.sunday_unli_session_id = session.id
      ),
      array['All courts']
    ) as court_names
  from public.sunday_unli_sessions session
  where session.id in (
    select signup.session_id
    from public.sunday_unli_signups signup
    where signup.customer_id = (select customer_id from me)
  );
$$;

revoke all on function public.get_my_event_sessions() from public, anon;

grant execute on function public.get_my_event_sessions()
to authenticated, service_role;

---------------------------------------------------------------------------
-- 3. Today's collected revenue for one day
-- Same rules as the revenue_daily view, but filtered by a time range so the
-- bookings starts_at index is used instead of aggregating all history.
---------------------------------------------------------------------------
create or replace function public.get_owner_collected_for_day(p_day date)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := p_day::timestamp at time zone 'Asia/Manila';
  v_end timestamptz := (p_day + 1)::timestamp at time zone 'Asia/Manila';
  v_total bigint;
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

  select coalesce(pg_catalog.sum(amount), 0)::bigint
  into v_total
  from (
    select p.amount
    from public.bookings b
    join public.payments p on p.booking_id = b.id
    where b.starts_at >= v_start
      and b.starts_at < v_end
      and b.status = 'confirmed'
      and b.kind in ('regular', 'recurring')
      and p.status = 'verified'

    union all

    select p.amount
    from public.bookings b
    join public.open_play_sessions session on session.booking_id = b.id
    join public.open_play_signups signup on signup.session_id = session.id
    join public.payments p on p.open_play_signup_id = signup.id
    where b.starts_at >= v_start
      and b.starts_at < v_end
      and b.status = 'confirmed'
      and session.is_published = true
      and signup.status = 'confirmed'
      and p.status = 'verified'

    union all

    select p.amount
    from public.sunday_unli_sessions session
    join public.sunday_unli_signups signup on signup.session_id = session.id
    join public.payments p on p.sunday_unli_signup_id = signup.id
    where session.starts_at >= v_start
      and session.starts_at < v_end
      and session.status = 'published'
      and signup.status = 'confirmed'
      and p.status = 'verified'
  ) collected;

  return v_total;
end;
$$;

revoke all on function public.get_owner_collected_for_day(date) from public, anon;

grant execute on function public.get_owner_collected_for_day(date)
to authenticated, service_role;

---------------------------------------------------------------------------
-- 4. Indexes for signup lookups
---------------------------------------------------------------------------
create index if not exists open_play_signups_customer_idx
on public.open_play_signups (customer_id, created_at desc);

create index if not exists sunday_unli_signups_customer_idx
on public.sunday_unli_signups (customer_id, created_at desc);

create index if not exists open_play_signups_session_idx
on public.open_play_signups (session_id);

create index if not exists sunday_unli_signups_session_idx
on public.sunday_unli_signups (session_id);

commit;
