-- Phase 3 - lock down the single owner account and review payments atomically.

begin;

-- The owner was enrolled with the one-time setup script. The application has
-- no staff-management feature, so authenticated sessions must not be able to
-- add or remove owner accounts through the data API.
revoke insert, update, delete on table public.admin_users from authenticated;

drop policy if exists admin_users_admin_all on public.admin_users;

create or replace function public.review_payment(
  p_payment_id uuid,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_reference text;
  v_parent_updated boolean := false;
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

  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject';
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment was not found';
  end if;

  if v_payment.status <> 'unverified' then
    raise exception 'Payment has already been reviewed';
  end if;

  if v_payment.booking_id is not null then
    select reference
    into v_reference
    from public.bookings
    where id = v_payment.booking_id
    for update;

    if p_decision = 'approve' then
      update public.bookings
      set status = 'confirmed', hold_expires_at = null
      where id = v_payment.booking_id
        and status = 'pending';
    else
      update public.bookings
      set status = 'cancelled', hold_expires_at = null
      where id = v_payment.booking_id
        and status in ('pending', 'cancelled');
    end if;

    v_parent_updated := found;
  elsif v_payment.open_play_signup_id is not null then
    select reference
    into v_reference
    from public.open_play_signups
    where id = v_payment.open_play_signup_id
    for update;

    if p_decision = 'approve' then
      update public.open_play_signups
      set status = 'confirmed', hold_expires_at = null
      where id = v_payment.open_play_signup_id
        and status = 'pending';
    else
      update public.open_play_signups
      set status = 'cancelled', hold_expires_at = null
      where id = v_payment.open_play_signup_id
        and status in ('pending', 'cancelled');
    end if;

    v_parent_updated := found;
  else
    select reference
    into v_reference
    from public.sunday_unli_signups
    where id = v_payment.sunday_unli_signup_id
    for update;

    if p_decision = 'approve' then
      update public.sunday_unli_signups
      set status = 'confirmed', hold_expires_at = null
      where id = v_payment.sunday_unli_signup_id
        and status = 'pending';
    else
      update public.sunday_unli_signups
      set status = 'cancelled', hold_expires_at = null
      where id = v_payment.sunday_unli_signup_id
        and status in ('pending', 'cancelled');
    end if;

    v_parent_updated := found;
  end if;

  if not v_parent_updated then
    raise exception 'The reservation is no longer awaiting review';
  end if;

  update public.payments
  set
    status = case
      when p_decision = 'approve' then 'verified'
      else 'rejected'
    end,
    verified_at = case
      when p_decision = 'approve' then pg_catalog.statement_timestamp()
      else null
    end,
    refunded_at = null
  where id = p_payment_id;

  return v_reference;
end;
$$;

revoke all on function public.review_payment(uuid, text) from public;

grant execute on function public.review_payment(uuid, text)
to authenticated, service_role;

commit;
