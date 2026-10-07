-- Replace refunds with rescheduling, by decision on October 7, 2026.
--
-- * A court block can no longer cancel a booking that has a submitted
--   payment. Tiffany reschedules those bookings first; unpaid bookings can
--   still be cancelled with an email.
-- * Cancelling an Open Play or Sunday Unli session marks each payment as
--   'reschedule_due'. Tiffany moves the player to another session and marks
--   the payment 'rescheduled' in Money.
-- * Existing 'refund_pending' payments become 'reschedule_due'. Historical
--   'refunded' rows stay valid so past records are not rewritten.

begin;

---------------------------------------------------------------------------
-- Payment statuses
---------------------------------------------------------------------------
alter table public.payments
  drop constraint payment_status;

alter table public.payments
  add column rescheduled_at timestamptz;

update public.payments
set status = 'reschedule_due', refunded_at = null
where status = 'refund_pending';

-- 'refunded' stays only for historical rows; 'refund_pending' is retired.
alter table public.payments
  add constraint payment_status check (
    status in (
      'unverified',
      'verified',
      'rejected',
      'reschedule_due',
      'rescheduled',
      'refunded'
    )
  );

---------------------------------------------------------------------------
-- Court blocks: paid bookings must be rescheduled first
---------------------------------------------------------------------------
create or replace function public.create_court_block(
  p_court_ids smallint[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text,
  p_expected_booking_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := pg_catalog.btrim(p_reason);
  v_court_ids smallint[];
  v_court_id smallint;
  v_active_court_count integer;
  v_actual_ids uuid[];
  v_expected_ids uuid[];
  v_block_id uuid;
  v_block_reference text;
  v_block_ids uuid[] := array[]::uuid[];
  v_block_references text[] := array[]::text[];
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

  if v_reason is null
     or pg_catalog.length(v_reason) < 3
     or pg_catalog.length(v_reason) > 240 then
    raise exception 'Block reason must be between 3 and 240 characters';
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

  perform 1
  from public.bookings
  where court_id = any(v_court_ids)
    and status <> 'cancelled'
    and pg_catalog.tstzrange(starts_at, ends_at, '[)')
      && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)')
  order by court_id, id
  for update;

  if exists (
    select 1
    from public.bookings
    where court_id = any(v_court_ids)
      and status <> 'cancelled'
      and kind not in ('regular', 'recurring')
      and pg_catalog.tstzrange(starts_at, ends_at, '[)')
        && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'This period overlaps a block or special session';
  end if;

  select coalesce(
    pg_catalog.array_agg(id order by id),
    array[]::uuid[]
  )
  into v_actual_ids
  from public.bookings
  where court_id = any(v_court_ids)
    and status <> 'cancelled'
    and kind in ('regular', 'recurring')
    and pg_catalog.tstzrange(starts_at, ends_at, '[)')
      && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)');

  select coalesce(
    pg_catalog.array_agg(expected_id order by expected_id),
    array[]::uuid[]
  )
  into v_expected_ids
  from (
    select distinct expected_id
    from pg_catalog.unnest(
      coalesce(p_expected_booking_ids, array[]::uuid[])
    ) as expected(expected_id)
  ) normalized_expected;

  if v_actual_ids is distinct from v_expected_ids then
    raise exception 'The schedule changed after preview. Review the conflicts again.';
  end if;

  if exists (
    select 1
    from public.payments payment
    where payment.booking_id = any(v_actual_ids)
      and payment.status in ('unverified', 'verified')
  ) then
    raise exception 'Reschedule paid bookings before blocking this period';
  end if;

  update public.bookings
  set
    status = 'cancelled',
    hold_expires_at = null,
    internal_note = case
      when internal_note is null or pg_catalog.btrim(internal_note) = ''
        then 'Cancelled by court block: ' || v_reason
      else internal_note || E'\nCancelled by court block: ' || v_reason
    end
  where id = any(v_actual_ids);

  begin
    foreach v_court_id in array v_court_ids loop
      insert into public.bookings (
        court_id,
        starts_at,
        ends_at,
        kind,
        status,
        block_reason,
        internal_note
      ) values (
        v_court_id,
        p_starts_at,
        p_ends_at,
        'blocked',
        'confirmed',
        v_reason,
        'Created from the owner calendar'
      )
      returning id, reference into v_block_id, v_block_reference;

      v_block_ids := pg_catalog.array_append(v_block_ids, v_block_id);
      v_block_references := pg_catalog.array_append(
        v_block_references,
        v_block_reference
      );
    end loop;
  exception
    when exclusion_violation then
      raise exception 'One or more selected court periods are no longer available';
  end;

  with inserted as (
    insert into public.customer_notifications (
      booking_id,
      block_id,
      recipient_name,
      recipient_email,
      booking_reference,
      court_name,
      starts_at,
      ends_at,
      reason,
      refund_amount
    )
    select
      booking.id,
      v_block_ids[
        pg_catalog.array_position(v_court_ids, booking.court_id)
      ],
      customer.full_name,
      customer.email,
      booking.reference,
      court.name,
      booking.starts_at,
      booking.ends_at,
      v_reason,
      0
    from public.bookings booking
    join public.courts court on court.id = booking.court_id
    join public.customers customer on customer.id = booking.customer_id
    where booking.id = any(v_actual_ids)
    returning id
  )
  select coalesce(
    pg_catalog.array_agg(id order by id),
    array[]::uuid[]
  )
  into v_notification_ids
  from inserted;

  return pg_catalog.jsonb_build_object(
    'block_ids', pg_catalog.to_jsonb(v_block_ids),
    'block_references', pg_catalog.to_jsonb(v_block_references),
    'block_count', pg_catalog.cardinality(v_block_ids),
    'cancelled_count', pg_catalog.cardinality(v_actual_ids),
    'notification_ids', pg_catalog.to_jsonb(v_notification_ids)
  );
end;
$$;

---------------------------------------------------------------------------
-- Event cancellation: payments become reschedule_due
-- customer_notifications.refund_amount now holds the amount the player paid
-- and keeps for a later session.
---------------------------------------------------------------------------
create or replace function public.remove_open_play_session(
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
  set status = 'reschedule_due', rescheduled_at = null
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
      and payment.status = 'reschedule_due'
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

create or replace function public.remove_sunday_unli_session(
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
  set status = 'reschedule_due', rescheduled_at = null
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
      and payment.status = 'reschedule_due'
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

---------------------------------------------------------------------------
-- Money: mark rescheduled instead of refunded
---------------------------------------------------------------------------
drop function public.mark_payment_refunded(uuid);

create function public.mark_payment_rescheduled(p_payment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
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

  select payment.*
  into v_payment
  from public.payments payment
  where payment.id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment was not found';
  end if;

  select coalesce(booking.reference, open_play.reference, sunday_unli.reference)
  into v_reference
  from public.payments payment
  left join public.bookings booking on booking.id = payment.booking_id
  left join public.open_play_signups open_play
    on open_play.id = payment.open_play_signup_id
  left join public.sunday_unli_signups sunday_unli
    on sunday_unli.id = payment.sunday_unli_signup_id
  where payment.id = p_payment_id;

  if v_payment.status = 'rescheduled' then
    return v_reference;
  end if;

  if v_payment.status <> 'reschedule_due' then
    raise exception 'Only a payment waiting to be rescheduled can be marked rescheduled';
  end if;

  update public.payments
  set
    status = 'rescheduled',
    rescheduled_at = pg_catalog.statement_timestamp()
  where id = p_payment_id;

  return v_reference;
end;
$$;

-- Append rescheduled_at to the private Money view.
create or replace view public.owner_money_records_private
with (security_invoker = true)
as
select
  payment.id as payment_id,
  payment.created_at as payment_created_at,
  payment.status as payment_status,
  payment.amount,
  payment.gcash_ref,
  payment.verified_at,
  payment.refunded_at,
  booking.reference,
  'court_booking'::text as record_type,
  customer.full_name as customer_name,
  customer.email as customer_email,
  customer.phone as customer_phone,
  booking.starts_at as schedule_start,
  booking.ends_at as schedule_end,
  court.name as court_names,
  booking.status as reservation_status,
  payment.rescheduled_at
from public.payments payment
join public.bookings booking on booking.id = payment.booking_id
join public.customers customer on customer.id = booking.customer_id
join public.courts court on court.id = booking.court_id

union all

select
  payment.id as payment_id,
  payment.created_at as payment_created_at,
  payment.status as payment_status,
  payment.amount,
  payment.gcash_ref,
  payment.verified_at,
  payment.refunded_at,
  signup.reference,
  'open_play'::text as record_type,
  customer.full_name as customer_name,
  customer.email as customer_email,
  customer.phone as customer_phone,
  booking.starts_at as schedule_start,
  booking.ends_at as schedule_end,
  coalesce(
    (
      select string_agg(court.name, ', ' order by court.id)
      from public.open_play_session_courts allocation
      join public.courts court on court.id = allocation.court_id
      where allocation.session_id = session.id
    ),
    court.name
  ) as court_names,
  signup.status as reservation_status,
  payment.rescheduled_at
from public.payments payment
join public.open_play_signups signup
  on signup.id = payment.open_play_signup_id
join public.customers customer on customer.id = signup.customer_id
join public.open_play_sessions session on session.id = signup.session_id
join public.bookings booking on booking.id = session.booking_id
join public.courts court on court.id = booking.court_id

union all

select
  payment.id as payment_id,
  payment.created_at as payment_created_at,
  payment.status as payment_status,
  payment.amount,
  payment.gcash_ref,
  payment.verified_at,
  payment.refunded_at,
  signup.reference,
  'sunday_unli'::text as record_type,
  customer.full_name as customer_name,
  customer.email as customer_email,
  customer.phone as customer_phone,
  session.starts_at as schedule_start,
  session.ends_at as schedule_end,
  coalesce(
    (
      select string_agg(court.name, ', ' order by court.id)
      from public.bookings booking
      join public.courts court on court.id = booking.court_id
      where booking.sunday_unli_session_id = session.id
    ),
    'All courts'
  ) as court_names,
  signup.status as reservation_status,
  payment.rescheduled_at
from public.payments payment
join public.sunday_unli_signups signup
  on signup.id = payment.sunday_unli_signup_id
join public.customers customer on customer.id = signup.customer_id
join public.sunday_unli_sessions session on session.id = signup.session_id;

revoke all on table public.owner_money_records_private
from public, anon, authenticated;

drop function public.get_owner_money_records(
  date, date, text, text, text, integer, integer
);

create function public.get_owner_money_records(
  p_from_date date default null,
  p_to_date date default null,
  p_payment_status text default null,
  p_record_type text default null,
  p_search_query text default null,
  p_page_size integer default 25,
  p_page_offset integer default 0
)
returns table (
  payment_id uuid,
  payment_created_at timestamptz,
  payment_status text,
  amount integer,
  gcash_ref text,
  verified_at timestamptz,
  refunded_at timestamptz,
  rescheduled_at timestamptz,
  reference text,
  record_type text,
  customer_name text,
  customer_email text,
  customer_phone text,
  schedule_start timestamptz,
  schedule_end timestamptz,
  court_names text,
  reservation_status text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(pg_catalog.btrim(coalesce(p_search_query, '')), '');
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

  if p_from_date is not null
     and p_to_date is not null
     and p_from_date > p_to_date then
    raise exception 'The starting date must be on or before the ending date';
  end if;

  if p_payment_status is not null
     and p_payment_status not in (
       'unverified',
       'verified',
       'rejected',
       'reschedule_due',
       'rescheduled',
       'refunded'
     ) then
    raise exception 'Payment status filter is invalid';
  end if;

  if p_record_type is not null
     and p_record_type not in ('court_booking', 'open_play', 'sunday_unli') then
    raise exception 'Record type filter is invalid';
  end if;

  return query
  select
    record.payment_id,
    record.payment_created_at,
    record.payment_status,
    record.amount,
    record.gcash_ref,
    record.verified_at,
    record.refunded_at,
    record.rescheduled_at,
    record.reference,
    record.record_type,
    record.customer_name,
    record.customer_email,
    record.customer_phone,
    record.schedule_start,
    record.schedule_end,
    record.court_names,
    record.reservation_status,
    pg_catalog.count(*) over()::bigint as total_count
  from public.owner_money_records_private record
  where (
      p_from_date is null
      or pg_catalog.timezone(
        'Asia/Manila',
        record.payment_created_at
      )::date >= p_from_date
    )
    and (
      p_to_date is null
      or pg_catalog.timezone(
        'Asia/Manila',
        record.payment_created_at
      )::date <= p_to_date
    )
    and (
      p_payment_status is null
      or record.payment_status = p_payment_status
    )
    and (
      p_record_type is null
      or record.record_type = p_record_type
    )
    and (
      v_search is null
      or record.reference ilike '%' || v_search || '%'
      or record.customer_name ilike '%' || v_search || '%'
      or record.customer_email ilike '%' || v_search || '%'
      or record.customer_phone ilike '%' || v_search || '%'
      or record.gcash_ref ilike '%' || v_search || '%'
    )
  order by record.payment_created_at desc, record.payment_id
  limit least(greatest(coalesce(p_page_size, 25), 1), 500)
  offset greatest(coalesce(p_page_offset, 0), 0);
end;
$$;

drop function public.get_owner_money_summary(date, date, text, text);

create function public.get_owner_money_summary(
  p_from_date date default null,
  p_to_date date default null,
  p_record_type text default null,
  p_search_query text default null
)
returns table (
  verified_revenue bigint,
  unverified_count bigint,
  reschedule_due_amount bigint,
  rescheduled_amount bigint,
  record_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(pg_catalog.btrim(coalesce(p_search_query, '')), '');
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

  if p_from_date is not null
     and p_to_date is not null
     and p_from_date > p_to_date then
    raise exception 'The starting date must be on or before the ending date';
  end if;

  if p_record_type is not null
     and p_record_type not in ('court_booking', 'open_play', 'sunday_unli') then
    raise exception 'Record type filter is invalid';
  end if;

  return query
  select
    coalesce(
      pg_catalog.sum(record.amount) filter (
        where record.payment_status = 'verified'
      ),
      0
    )::bigint as verified_revenue,
    pg_catalog.count(*) filter (
      where record.payment_status = 'unverified'
    )::bigint as unverified_count,
    coalesce(
      pg_catalog.sum(record.amount) filter (
        where record.payment_status = 'reschedule_due'
      ),
      0
    )::bigint as reschedule_due_amount,
    coalesce(
      pg_catalog.sum(record.amount) filter (
        where record.payment_status = 'rescheduled'
      ),
      0
    )::bigint as rescheduled_amount,
    pg_catalog.count(*)::bigint as record_count
  from public.owner_money_records_private record
  where (
      p_from_date is null
      or pg_catalog.timezone(
        'Asia/Manila',
        record.payment_created_at
      )::date >= p_from_date
    )
    and (
      p_to_date is null
      or pg_catalog.timezone(
        'Asia/Manila',
        record.payment_created_at
      )::date <= p_to_date
    )
    and (
      p_record_type is null
      or record.record_type = p_record_type
    )
    and (
      v_search is null
      or record.reference ilike '%' || v_search || '%'
      or record.customer_name ilike '%' || v_search || '%'
      or record.customer_email ilike '%' || v_search || '%'
      or record.customer_phone ilike '%' || v_search || '%'
      or record.gcash_ref ilike '%' || v_search || '%'
    );
end;
$$;

revoke all on function public.get_owner_money_records(
  date, date, text, text, text, integer, integer
) from public;
revoke all on function public.get_owner_money_summary(
  date, date, text, text
) from public;
revoke all on function public.mark_payment_rescheduled(uuid) from public;

grant execute on function public.get_owner_money_records(
  date, date, text, text, text, integer, integer
) to authenticated, service_role;
grant execute on function public.get_owner_money_summary(
  date, date, text, text
) to authenticated, service_role;
grant execute on function public.mark_payment_rescheduled(uuid)
to authenticated, service_role;

commit;
