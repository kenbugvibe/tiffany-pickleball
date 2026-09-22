-- Phase 7 - owner financial reporting, CSV records, and refund completion.

begin;

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
  booking.status as reservation_status
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
  signup.status as reservation_status
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
  signup.status as reservation_status
from public.payments payment
join public.sunday_unli_signups signup
  on signup.id = payment.sunday_unli_signup_id
join public.customers customer on customer.id = signup.customer_id
join public.sunday_unli_sessions session on session.id = signup.session_id;

revoke all on table public.owner_money_records_private
from public, anon, authenticated;

create or replace function public.get_owner_money_records(
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
       'refund_pending',
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

create or replace function public.get_owner_money_summary(
  p_from_date date default null,
  p_to_date date default null,
  p_record_type text default null,
  p_search_query text default null
)
returns table (
  verified_revenue bigint,
  unverified_count bigint,
  refund_pending_amount bigint,
  refunded_amount bigint,
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
        where record.payment_status = 'refund_pending'
      ),
      0
    )::bigint as refund_pending_amount,
    coalesce(
      pg_catalog.sum(record.amount) filter (
        where record.payment_status = 'refunded'
      ),
      0
    )::bigint as refunded_amount,
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

create or replace function public.mark_payment_refunded(p_payment_id uuid)
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

  if v_payment.status = 'refunded' then
    return v_reference;
  end if;

  if v_payment.status <> 'refund_pending' then
    raise exception 'Only a refund-pending payment can be marked refunded';
  end if;

  update public.payments
  set
    status = 'refunded',
    refunded_at = pg_catalog.statement_timestamp()
  where id = p_payment_id;

  return v_reference;
end;
$$;

revoke all on function public.get_owner_money_records(
  date,
  date,
  text,
  text,
  text,
  integer,
  integer
) from public;
revoke all on function public.get_owner_money_summary(
  date,
  date,
  text,
  text
) from public;
revoke all on function public.mark_payment_refunded(uuid) from public;

grant execute on function public.get_owner_money_records(
  date,
  date,
  text,
  text,
  text,
  integer,
  integer
) to authenticated, service_role;
grant execute on function public.get_owner_money_summary(
  date,
  date,
  text,
  text
) to authenticated, service_role;
grant execute on function public.mark_payment_refunded(uuid)
to authenticated, service_role;

commit;
