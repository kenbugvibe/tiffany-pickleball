-- Phase 4 - create one atomic court block across one, two, or all courts.

begin;

drop function if exists public.create_court_block(
  smallint,
  timestamptz,
  timestamptz,
  text,
  uuid[]
);

create function public.create_court_block(
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

  -- Lock selected courts in a stable order so simultaneous scheduling actions
  -- cannot partially reserve the requested group.
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

  -- Lock all live conflicts before comparing the owner's preview with the
  -- current schedule. One conflict on any court stops the entire operation.
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
      case
        when payment.status = 'refund_pending' then payment.amount
        else 0
      end
    from public.bookings booking
    join public.courts court on court.id = booking.court_id
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
    'block_ids', pg_catalog.to_jsonb(v_block_ids),
    'block_references', pg_catalog.to_jsonb(v_block_references),
    'block_count', pg_catalog.cardinality(v_block_ids),
    'cancelled_count', pg_catalog.cardinality(v_actual_ids),
    'notification_ids', pg_catalog.to_jsonb(v_notification_ids)
  );
end;
$$;

revoke all on function public.create_court_block(
  smallint[],
  timestamptz,
  timestamptz,
  text,
  uuid[]
) from public;

grant execute on function public.create_court_block(
  smallint[],
  timestamptz,
  timestamptz,
  text,
  uuid[]
) to authenticated, service_role;

commit;
