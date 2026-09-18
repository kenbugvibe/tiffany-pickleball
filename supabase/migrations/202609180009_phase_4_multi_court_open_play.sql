-- Phase 4 - allow one open-play session to reserve one, two, or all courts.

begin;

create table public.open_play_session_courts (
  session_id uuid not null references public.open_play_sessions(id) on delete cascade,
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  court_id smallint not null references public.courts(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  constraint open_play_session_courts_pk primary key (session_id, court_id)
);

create or replace function public.validate_open_play_session_court()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.bookings
    where id = new.booking_id
      and court_id = new.court_id
      and kind = 'open_play'
  ) then
    raise exception 'Open-play court allocation must match an open-play booking';
  end if;

  return new;
end;
$$;

create trigger validate_open_play_session_court_before_write
before insert or update of booking_id, court_id
on public.open_play_session_courts
for each row execute function public.validate_open_play_session_court();

insert into public.open_play_session_courts (session_id, booking_id, court_id)
select session.id, booking.id, booking.court_id
from public.open_play_sessions session
join public.bookings booking on booking.id = session.booking_id
on conflict do nothing;

alter table public.open_play_session_courts enable row level security;

revoke all on table public.open_play_session_courts from anon, authenticated;
grant select on table public.open_play_session_courts to authenticated;

create policy open_play_session_courts_admin_all
on public.open_play_session_courts for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop function if exists public.create_open_play_session(
  smallint,
  timestamptz,
  timestamptz,
  text,
  text
);

create function public.create_open_play_session(
  p_court_ids smallint[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_title text,
  p_customer_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_customer_note text := nullif(
    pg_catalog.btrim(coalesce(p_customer_note, '')),
    ''
  );
  v_court_ids smallint[];
  v_court_id smallint;
  v_active_court_count integer;
  v_price integer;
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

  select coalesce(
    pg_catalog.array_agg(distinct submitted.court_id order by submitted.court_id),
    array[]::smallint[]
  )
  into v_court_ids
  from pg_catalog.unnest(coalesce(p_court_ids, array[]::smallint[]))
    as submitted(court_id)
  where submitted.court_id is not null;

  if pg_catalog.cardinality(v_court_ids) < 1
     or pg_catalog.cardinality(v_court_ids) > 3 then
    raise exception 'Choose one, two, or all three courts';
  end if;

  if pg_catalog.length(v_title) < 3
     or pg_catalog.length(v_title) > 80 then
    raise exception 'Open-play title must be between 3 and 80 characters';
  end if;

  if v_customer_note is not null
     and pg_catalog.length(v_customer_note) > 500 then
    raise exception 'Open-play customer note must be 500 characters or fewer';
  end if;

  if p_starts_at is null
     or p_ends_at is null
     or p_starts_at <= pg_catalog.statement_timestamp()
     or not public.is_valid_court_period(p_starts_at, p_ends_at) then
    raise exception 'Choose a future whole-hour period between 8:00 AM and midnight';
  end if;

  perform 1
  from public.courts
  where id = any(v_court_ids)
  order by id
  for update;

  select pg_catalog.count(*)::integer
  into v_active_court_count
  from public.courts
  where id = any(v_court_ids)
    and is_active = true;

  if v_active_court_count <> pg_catalog.cardinality(v_court_ids) then
    raise exception 'Every selected court must be active';
  end if;

  select open_play_price_per_player
  into v_price
  from public.business_settings
  where id = 1;

  if v_price is null then
    raise exception 'Open-play pricing is not configured';
  end if;

  begin
    foreach v_court_id in array v_court_ids loop
      insert into public.bookings (
        court_id,
        starts_at,
        ends_at,
        kind,
        status,
        internal_note
      ) values (
        v_court_id,
        p_starts_at,
        p_ends_at,
        'open_play',
        'confirmed',
        'Published from the owner calendar'
      )
      returning id into v_booking_id;

      v_booking_ids := pg_catalog.array_append(v_booking_ids, v_booking_id);
    end loop;
  exception
    when exclusion_violation then
      raise exception 'One or more selected court periods are no longer available';
  end;

  insert into public.open_play_sessions (
    booking_id,
    title,
    price_per_player,
    is_published,
    customer_note
  ) values (
    v_booking_ids[1],
    v_title,
    v_price,
    true,
    v_customer_note
  )
  returning id, reference into v_session_id, v_session_reference;

  insert into public.open_play_session_courts (
    session_id,
    booking_id,
    court_id
  )
  select
    v_session_id,
    v_booking_ids[positions.array_index],
    v_court_ids[positions.array_index]
  from pg_catalog.generate_subscripts(v_court_ids, 1)
    as positions(array_index);

  return pg_catalog.jsonb_build_object(
    'session_id', v_session_id,
    'session_reference', v_session_reference,
    'booking_ids', pg_catalog.to_jsonb(v_booking_ids),
    'court_ids', pg_catalog.to_jsonb(v_court_ids),
    'court_count', pg_catalog.cardinality(v_court_ids),
    'price_per_player', v_price
  );
end;
$$;

create or replace function public.remove_open_play_session(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference text;
  v_primary_booking_id uuid;
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

  select session.reference, session.booking_id
  into v_reference, v_primary_booking_id
  from public.open_play_sessions session
  join public.bookings booking on booking.id = session.booking_id
  where session.id = p_session_id
    and session.is_published = true
    and booking.kind = 'open_play'
    and booking.status <> 'cancelled'
    and booking.ends_at > pg_catalog.statement_timestamp()
  for update of session, booking;

  if not found then
    raise exception 'An active or upcoming open-play session was not found';
  end if;

  perform 1
  from public.bookings booking
  join public.open_play_session_courts allocation
    on allocation.booking_id = booking.id
  where allocation.session_id = p_session_id
  order by booking.id
  for update of booking;

  if exists (
    select 1
    from public.open_play_signups
    where session_id = p_session_id
      and status <> 'cancelled'
  ) then
    raise exception 'This open-play session has active participants and cannot be removed';
  end if;

  update public.open_play_sessions
  set is_published = false
  where id = p_session_id;

  update public.bookings
  set
    status = 'cancelled',
    internal_note = case
      when internal_note is null or pg_catalog.btrim(internal_note) = ''
        then 'Open play removed from the owner calendar'
      else internal_note || E'\nOpen play removed from the owner calendar'
    end
  where id = v_primary_booking_id
     or id in (
       select allocation.booking_id
       from public.open_play_session_courts allocation
       where allocation.session_id = p_session_id
     );

  return v_reference;
end;
$$;

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
      and b.starts_at < slots.ends_at
      and b.ends_at > slots.starts_at
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

revoke all on function public.validate_open_play_session_court() from public;

revoke all on function public.create_open_play_session(
  smallint[],
  timestamptz,
  timestamptz,
  text,
  text
) from public;

grant execute on function public.create_open_play_session(
  smallint[],
  timestamptz,
  timestamptz,
  text,
  text
) to authenticated, service_role;

revoke all on function public.remove_open_play_session(uuid) from public;
grant execute on function public.remove_open_play_session(uuid)
to authenticated, service_role;

commit;
