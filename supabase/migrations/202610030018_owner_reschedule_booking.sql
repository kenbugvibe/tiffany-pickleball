-- Let the owner move an upcoming court booking to another court, date, or
-- start time. The duration and the customer's price stay the same, and a
-- customer notification is queued so the app can email the new schedule.

begin;

alter table public.customer_notifications
  alter column block_id drop not null,
  alter column reason drop not null,
  add column previous_court_name text,
  add column previous_starts_at timestamptz,
  add column previous_ends_at timestamptz;

alter table public.customer_notifications
  drop constraint customer_notification_kind,
  drop constraint customer_notification_reason_present;

alter table public.customer_notifications
  add constraint customer_notification_kind check (
    (
      kind = 'court_blocked'
      and block_id is not null
      and reason is not null
      and pg_catalog.length(pg_catalog.btrim(reason)) > 0
      and previous_starts_at is null
    )
    or (
      kind = 'booking_rescheduled'
      and block_id is null
      and previous_court_name is not null
      and previous_starts_at is not null
      and previous_ends_at is not null
    )
  );

create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_court_id smallint,
  p_starts_at timestamptz,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_booking public.bookings%rowtype;
  v_ends_at timestamptz;
  v_previous_court_name text;
  v_court_name text;
  v_notification_id uuid;
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

  if pg_catalog.length(coalesce(v_note, '')) > 240 then
    raise exception 'Reschedule note is too long';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found
     or v_booking.kind <> 'regular'
     or v_booking.status not in ('pending', 'confirmed')
     or v_booking.starts_at <= pg_catalog.statement_timestamp() then
    raise exception 'This booking cannot be rescheduled';
  end if;

  select name
  into v_court_name
  from public.courts
  where id = p_court_id
    and is_active;

  if v_court_name is null then
    raise exception 'Choose an active court';
  end if;

  v_ends_at := p_starts_at + (v_booking.ends_at - v_booking.starts_at);

  if p_starts_at <= pg_catalog.statement_timestamp() then
    raise exception 'The new time must be in the future';
  end if;

  if not public.is_valid_court_period(p_starts_at, v_ends_at) then
    raise exception 'The new time is outside operating hours';
  end if;

  if p_court_id = v_booking.court_id
     and p_starts_at = v_booking.starts_at then
    raise exception 'Choose a different court or time';
  end if;

  if exists (
    select 1
    from public.bookings
    where court_id = p_court_id
      and id <> v_booking.id
      and status <> 'cancelled'
      and pg_catalog.tstzrange(starts_at, ends_at, '[)')
        && pg_catalog.tstzrange(p_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'The new time is no longer available';
  end if;

  select name
  into v_previous_court_name
  from public.courts
  where id = v_booking.court_id;

  begin
    update public.bookings
    set
      court_id = p_court_id,
      starts_at = p_starts_at,
      ends_at = v_ends_at,
      internal_note = case
        when internal_note is null or pg_catalog.btrim(internal_note) = ''
          then 'Rescheduled by owner from ' || v_previous_court_name || ' '
            || pg_catalog.to_char(
              pg_catalog.timezone('Asia/Manila', v_booking.starts_at),
              'YYYY-MM-DD HH24:MI'
            )
        else internal_note || E'\nRescheduled by owner from '
          || v_previous_court_name || ' '
          || pg_catalog.to_char(
            pg_catalog.timezone('Asia/Manila', v_booking.starts_at),
            'YYYY-MM-DD HH24:MI'
          )
      end
    where id = v_booking.id;
  exception
    when exclusion_violation then
      raise exception 'The new time is no longer available';
  end;

  -- prepare_booking() reprices on every time change. An owner-initiated move
  -- keeps the original price, so restore it. Fee columns do not fire the
  -- trigger.
  update public.bookings
  set
    court_fee = v_booking.court_fee,
    paddle_fee = v_booking.paddle_fee,
    total_amount = v_booking.total_amount
  where id = v_booking.id;

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
    previous_court_name,
    previous_starts_at,
    previous_ends_at
  )
  select
    'booking_rescheduled',
    v_booking.id,
    customer.full_name,
    customer.email,
    v_booking.reference,
    v_court_name,
    p_starts_at,
    v_ends_at,
    v_note,
    v_previous_court_name,
    v_booking.starts_at,
    v_booking.ends_at
  from public.customers customer
  where customer.id = v_booking.customer_id
  returning id into v_notification_id;

  return pg_catalog.jsonb_build_object(
    'booking_reference', v_booking.reference,
    'starts_at', p_starts_at,
    'notification_id', v_notification_id
  );
end;
$$;

revoke all on function public.reschedule_booking(uuid, smallint, timestamptz, text)
from public;
grant execute on function public.reschedule_booking(uuid, smallint, timestamptz, text)
to authenticated, service_role;

commit;
