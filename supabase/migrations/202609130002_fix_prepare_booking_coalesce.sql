-- Repair Phase 1 installations created by migration 202609130001.
-- COALESCE is PostgreSQL syntax and cannot be schema-qualified.

begin;

create or replace function public.prepare_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration_hours integer;
  v_priced_hours integer;
  v_court_fee integer;
  v_paddle_price integer;
  v_hold_minutes integer;
begin
  if new.reference is null or pg_catalog.btrim(new.reference) = '' then
    new.reference := public.next_public_reference();
  end if;

  if not public.is_valid_court_period(new.starts_at, new.ends_at) then
    raise exception 'Booking must use whole-hour slots between 8:00 AM and midnight Asia/Manila';
  end if;

  v_duration_hours :=
    extract(epoch from (new.ends_at - new.starts_at))::integer / 3600;

  if new.kind in ('regular', 'recurring') then
    if new.customer_id is null then
      raise exception 'Customer is required for regular and recurring bookings';
    end if;

    select
      pg_catalog.count(*)::integer,
      coalesce(pg_catalog.sum(rb.price_per_hour), 0)::integer
    into v_priced_hours, v_court_fee
    from pg_catalog.generate_series(0, v_duration_hours - 1) as slot(offset_hours)
    join public.rate_blocks rb
      on extract(
        hour from pg_catalog.timezone(
          'Asia/Manila',
          new.starts_at + slot.offset_hours * interval '1 hour'
        )
      )::integer >= rb.start_hour
      and extract(
        hour from pg_catalog.timezone(
          'Asia/Manila',
          new.starts_at + slot.offset_hours * interval '1 hour'
        )
      )::integer < rb.end_hour;

    if v_priced_hours <> v_duration_hours then
      raise exception 'Every booking hour must have a configured court rate';
    end if;

    select paddle_price_per_hour, hold_minutes
    into v_paddle_price, v_hold_minutes
    from public.business_settings
    where id = 1;

    new.court_fee := v_court_fee;
    new.paddle_fee := new.paddle_count * v_paddle_price * v_duration_hours;
    new.total_amount := new.court_fee + new.paddle_fee;

    if tg_op = 'INSERT' and new.kind = 'regular' then
      if new.starts_at <= pg_catalog.statement_timestamp() then
        raise exception 'A customer booking must start in the future';
      end if;

      new.status := 'pending';
      new.hold_expires_at :=
        pg_catalog.statement_timestamp() + pg_catalog.make_interval(mins => v_hold_minutes);
      new.payment_proof_submitted_at := null;
      new.block_reason := null;
      new.internal_note := null;
      new.sunday_unli_session_id := null;
      new.recurring_rule_id := null;
    elsif new.kind = 'recurring' then
      new.hold_expires_at := null;
    end if;
  else
    new.customer_id := null;
    new.paddle_count := 0;
    new.court_fee := 0;
    new.paddle_fee := 0;
    new.total_amount := 0;
    new.hold_expires_at := null;
  end if;

  return new;
end;
$$;

commit;
