-- Tiffany's Pickleball Court - one-time owner setup
-- Run after the Phase 1 migration and before any customer accounts are created.
-- This intentionally contains no email address or Auth user UID.

begin;

do $$
declare
  v_auth_user_count integer;
  v_owner_user_id uuid;
begin
  select count(*)::integer, min(id::text)::uuid
  into v_auth_user_count, v_owner_user_id
  from auth.users;

  if v_auth_user_count <> 1 then
    raise exception
      'Safety check failed: expected exactly one Auth user, found %. Do not guess which user is the owner.',
      v_auth_user_count;
  end if;

  insert into public.admin_users (user_id)
  values (v_owner_user_id)
  on conflict (user_id) do nothing;

  if not exists (
    select 1
    from public.admin_users
    where user_id = v_owner_user_id
  ) then
    raise exception 'Owner setup failed';
  end if;
end;
$$;

select 'PASS - the only existing Auth user is now an owner' as owner_setup_result;

commit;
