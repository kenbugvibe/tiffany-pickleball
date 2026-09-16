-- Phase 4 - let the owner reopen an active or upcoming blocked period.

begin;

create or replace function public.remove_court_block(p_block_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
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

  select reference
  into v_reference
  from public.bookings
  where id = p_block_id
    and kind = 'blocked'
    and status <> 'cancelled'
    and ends_at > pg_catalog.statement_timestamp()
  for update;

  if not found then
    raise exception 'An active or upcoming court block was not found';
  end if;

  update public.bookings
  set
    status = 'cancelled',
    internal_note = case
      when internal_note is null or pg_catalog.btrim(internal_note) = ''
        then 'Removed from the owner calendar'
      else internal_note || E'\nRemoved from the owner calendar'
    end
  where id = p_block_id;

  return v_reference;
end;
$$;

revoke all on function public.remove_court_block(uuid) from public;

grant execute on function public.remove_court_block(uuid)
to authenticated, service_role;

commit;
