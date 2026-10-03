-- Let the owner cancel Open Play and Sunday Unli sessions that already have
-- participants. Active signups are cancelled, any submitted payment is marked
-- for refund, and a customer notification is queued for every player.

begin;

alter table public.customer_notifications
  add column event_label text;

alter table public.customer_notifications
  drop constraint customer_notification_kind;

alter table public.customer_notifications
  add constraint customer_notification_kind check (
    (
      kind = 'court_blocked'
      and block_id is not null
      and reason is not null
      and pg_catalog.length(pg_catalog.btrim(reason)) > 0
      and previous_starts_at is null
      and event_label is null
    )
    or (
      kind = 'booking_rescheduled'
      and block_id is null
      and previous_court_name is not null
      and previous_starts_at is not null
      and previous_ends_at is not null
      and event_label is null
    )
    or (
      kind = 'event_cancelled'
      and block_id is null
      and previous_starts_at is null
      and event_label is not null
    )
  );

drop function public.remove_open_play_session(uuid);

create function public.remove_open_play_session(
  p_session_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_reference text;
  v_title text;
  v_primary_booking_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_court_names text;
  v_signup_ids uuid[];
  v_notification_ids uuid[];
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

  if pg_catalog.length(coalesce(v_reason, '')) > 240 then
    raise exception 'Cancellation reason is too long';
  end if;

  select
    session.reference,
    session.title,
    session.booking_id,
    booking.starts_at,
    booking.ends_at
  into v_reference, v_title, v_primary_booking_id, v_starts_at, v_ends_at
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

  select pg_catalog.string_agg(court.name, ', ' order by court.id)
  into v_court_names
  from public.open_play_session_courts allocation
  join public.courts court on court.id = allocation.court_id
  where allocation.session_id = p_session_id;

  select coalesce(pg_catalog.array_agg(id order by id), array[]::uuid[])
  into v_signup_ids
  from (
    select signup.id
    from public.open_play_signups signup
    where signup.session_id = p_session_id
      and signup.status in ('pending', 'confirmed')
    order by signup.id
    for update
  ) active_signups;

  update public.open_play_signups
  set status = 'cancelled', hold_expires_at = null
  where id = any(v_signup_ids);

  update public.payments
  set status = 'refund_pending', refunded_at = null
  where open_play_signup_id = any(v_signup_ids)
    and status in ('verified', 'unverified');

  with inserted as (
    insert into public.customer_notifications (
      kind,
      booking_id,
      recipient_name,
      recipient_email,
      booking_reference,
      court_name,
      starts_at,
      ends_at,
      reason,
      refund_amount,
      event_label
    )
    select
      'event_cancelled',
      v_primary_booking_id,
      customer.full_name,
      customer.email,
      signup.reference,
      coalesce(v_court_names, 'Open play courts'),
      v_starts_at,
      v_ends_at,
      v_reason,
      coalesce(payment.amount, 0),
      v_title
    from public.open_play_signups signup
    join public.customers customer on customer.id = signup.customer_id
    left join public.payments payment
      on payment.open_play_signup_id = signup.id
      and payment.status = 'refund_pending'
    where signup.id = any(v_signup_ids)
    returning id
  )
  select coalesce(pg_catalog.array_agg(id), array[]::uuid[])
  into v_notification_ids
  from inserted;

  update public.open_play_sessions
  set is_published = false
  where id = p_session_id;

  update public.bookings
  set
    status = 'cancelled',
    internal_note = case
      when internal_note is null or pg_catalog.btrim(internal_note) = ''
        then 'Open play cancelled from the owner calendar'
      else internal_note || E'\nOpen play cancelled from the owner calendar'
    end
  where id = v_primary_booking_id
     or id in (
       select allocation.booking_id
       from public.open_play_session_courts allocation
       where allocation.session_id = p_session_id
     );

  return pg_catalog.jsonb_build_object(
    'session_reference', v_reference,
    'cancelled_count', pg_catalog.cardinality(v_signup_ids),
    'notification_ids', pg_catalog.to_jsonb(v_notification_ids)
  );
end;
$$;

drop function public.remove_sunday_unli_session(uuid);

create function public.remove_sunday_unli_session(
  p_session_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_reference text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_anchor_booking_id uuid;
  v_signup_ids uuid[];
  v_notification_ids uuid[];
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

  if pg_catalog.length(coalesce(v_reason, '')) > 240 then
    raise exception 'Cancellation reason is too long';
  end if;

  select session.reference, session.starts_at, session.ends_at
  into v_reference, v_starts_at, v_ends_at
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

  select booking.id
  into v_anchor_booking_id
  from public.bookings booking
  where booking.sunday_unli_session_id = p_session_id
  order by booking.court_id
  limit 1;

  select coalesce(pg_catalog.array_agg(id order by id), array[]::uuid[])
  into v_signup_ids
  from (
    select signup.id
    from public.sunday_unli_signups signup
    where signup.session_id = p_session_id
      and signup.status in ('pending', 'confirmed')
    order by signup.id
    for update
  ) active_signups;

  update public.sunday_unli_signups
  set status = 'cancelled', hold_expires_at = null
  where id = any(v_signup_ids);

  update public.payments
  set status = 'refund_pending', refunded_at = null
  where sunday_unli_signup_id = any(v_signup_ids)
    and status in ('verified', 'unverified');

  with inserted as (
    insert into public.customer_notifications (
      kind,
      booking_id,
      recipient_name,
      recipient_email,
      booking_reference,
      court_name,
      starts_at,
      ends_at,
      reason,
      refund_amount,
      event_label
    )
    select
      'event_cancelled',
      v_anchor_booking_id,
      customer.full_name,
      customer.email,
      signup.reference,
      'All courts',
      v_starts_at,
      v_ends_at,
      v_reason,
      coalesce(payment.amount, 0),
      'Sunday Unli Play'
    from public.sunday_unli_signups signup
    join public.customers customer on customer.id = signup.customer_id
    left join public.payments payment
      on payment.sunday_unli_signup_id = signup.id
      and payment.status = 'refund_pending'
    where signup.id = any(v_signup_ids)
    returning id
  )
  select coalesce(pg_catalog.array_agg(id), array[]::uuid[])
  into v_notification_ids
  from inserted;

  update public.sunday_unli_sessions
  set status = 'cancelled'
  where id = p_session_id;

  update public.bookings
  set
    status = 'cancelled',
    internal_note = case
      when internal_note is null or pg_catalog.btrim(internal_note) = ''
        then 'Sunday unli cancelled from the owner calendar'
      else internal_note || E'\nSunday unli cancelled from the owner calendar'
    end
  where sunday_unli_session_id = p_session_id
    and status <> 'cancelled';

  return pg_catalog.jsonb_build_object(
    'session_reference', v_reference,
    'cancelled_count', pg_catalog.cardinality(v_signup_ids),
    'notification_ids', pg_catalog.to_jsonb(v_notification_ids)
  );
end;
$$;

revoke all on function public.remove_open_play_session(uuid, text) from public;
revoke all on function public.remove_sunday_unli_session(uuid, text) from public;

grant execute on function public.remove_open_play_session(uuid, text)
to authenticated, service_role;
grant execute on function public.remove_sunday_unli_session(uuid, text)
to authenticated, service_role;

commit;
