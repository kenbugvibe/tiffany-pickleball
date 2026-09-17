-- Phase 4 - atomically publish and safely remove owner open-play sessions.

begin;

create or replace function public.create_open_play_session(
  p_court_id smallint,
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
  v_price integer;
  v_booking_id uuid;
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
  where id = p_court_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Active court was not found';
  end if;

  select open_play_price_per_player
  into v_price
  from public.business_settings
  where id = 1;

  if v_price is null then
    raise exception 'Open-play pricing is not configured';
  end if;

  begin
    insert into public.bookings (
      court_id,
      starts_at,
      ends_at,
      kind,
      status,
      internal_note
    ) values (
      p_court_id,
      p_starts_at,
      p_ends_at,
      'open_play',
      'confirmed',
      'Published from the owner calendar'
    )
    returning id into v_booking_id;
  exception
    when exclusion_violation then
      raise exception 'The selected court period is no longer available';
  end;

  insert into public.open_play_sessions (
    booking_id,
    title,
    price_per_player,
    is_published,
    customer_note
  ) values (
    v_booking_id,
    v_title,
    v_price,
    true,
    v_customer_note
  )
  returning id, reference into v_session_id, v_session_reference;

  return pg_catalog.jsonb_build_object(
    'session_id', v_session_id,
    'session_reference', v_session_reference,
    'booking_id', v_booking_id,
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
  v_booking_id uuid;
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
  into v_reference, v_booking_id
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
  where id = v_booking_id;

  return v_reference;
end;
$$;

revoke all on function public.create_open_play_session(
  smallint,
  timestamptz,
  timestamptz,
  text,
  text
) from public;

grant execute on function public.create_open_play_session(
  smallint,
  timestamptz,
  timestamptz,
  text,
  text
) to authenticated, service_role;

revoke all on function public.remove_open_play_session(uuid) from public;

grant execute on function public.remove_open_play_session(uuid)
to authenticated, service_role;

commit;
