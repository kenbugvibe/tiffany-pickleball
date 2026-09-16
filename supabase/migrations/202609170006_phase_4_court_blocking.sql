-- Phase 4 - safely block courts, cancel conflicts, and queue customer notices.

begin;

create table public.customer_notifications (
  id                uuid primary key default pg_catalog.gen_random_uuid(),
  kind              text not null default 'court_blocked',
  booking_id        uuid not null references public.bookings(id) on delete restrict,
  block_id          uuid not null references public.bookings(id) on delete restrict,
  recipient_name    text not null,
  recipient_email   text not null,
  booking_reference text not null,
  court_name        text not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  reason            text not null,
  refund_amount     integer not null default 0,
  status            text not null default 'pending',
  last_error        text,
  sent_at           timestamptz,
  created_at        timestamptz not null default pg_catalog.now(),
  constraint customer_notification_kind check (kind = 'court_blocked'),
  constraint customer_notification_status check (
    status in ('pending', 'sent', 'failed')
  ),
  constraint customer_notification_email_present check (
    position('@' in recipient_email) > 1
  ),
  constraint customer_notification_reason_present check (
    pg_catalog.length(pg_catalog.btrim(reason)) > 0
  ),
  constraint customer_notification_refund_nonnegative check (refund_amount >= 0),
  constraint customer_notification_once unique (block_id, booking_id)
);

create index customer_notifications_status_idx
on public.customer_notifications (status, created_at);

alter table public.customer_notifications enable row level security;

revoke all on table public.customer_notifications from anon, authenticated;

grant select, update on table public.customer_notifications to authenticated;

create policy customer_notifications_admin_all
on public.customer_notifications for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create or replace function public.create_court_block(
  p_court_id smallint,
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
  v_court_name text;
  v_actual_ids uuid[];
  v_expected_ids uuid[];
  v_block_id uuid;
  v_block_reference text;
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

  select name
  into v_court_name
  from public.courts
  where id = p_court_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Active court was not found';
  end if;

  -- Lock all current conflicts in a consistent order before comparing the
  -- preview supplied by the owner with the live database state.
  perform 1
  from public.bookings
  where court_id = p_court_id
    and status <> 'cancelled'
    and pg_catalog.tstzrange(starts_at, ends_at, '[)')
      && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)')
  order by id
  for update;

  if exists (
    select 1
    from public.bookings
    where court_id = p_court_id
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
  where court_id = p_court_id
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

  update public.payments
  set
    status = case
      when status = 'verified' then 'refund_pending'
      else 'rejected'
    end,
    refunded_at = null
  where booking_id = any(v_actual_ids)
    and status in ('verified', 'unverified');

  insert into public.bookings (
    court_id,
    starts_at,
    ends_at,
    kind,
    status,
    block_reason,
    internal_note
  ) values (
    p_court_id,
    p_starts_at,
    p_ends_at,
    'blocked',
    'confirmed',
    v_reason,
    'Created from the owner calendar'
  )
  returning id, reference into v_block_id, v_block_reference;

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
      v_block_id,
      customer.full_name,
      customer.email,
      booking.reference,
      v_court_name,
      booking.starts_at,
      booking.ends_at,
      v_reason,
      case
        when payment.status = 'refund_pending' then payment.amount
        else 0
      end
    from public.bookings booking
    join public.customers customer on customer.id = booking.customer_id
    left join public.payments payment on payment.booking_id = booking.id
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
    'block_id', v_block_id,
    'block_reference', v_block_reference,
    'cancelled_count', pg_catalog.cardinality(v_actual_ids),
    'notification_ids', v_notification_ids
  );
end;
$$;

revoke all on function public.create_court_block(
  smallint,
  timestamptz,
  timestamptz,
  text,
  uuid[]
) from public;

grant execute on function public.create_court_block(
  smallint,
  timestamptz,
  timestamptz,
  text,
  uuid[]
) to authenticated, service_role;

commit;
