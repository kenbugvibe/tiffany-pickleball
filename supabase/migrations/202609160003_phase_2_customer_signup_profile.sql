-- Phase 2 - create the customer profile row at signup.
--
-- Email confirmation is enabled, so there is no session when an account is
-- created and `customers_create_own` (which requires auth.uid()) cannot apply.
-- This security definer trigger writes the profile row instead.
--
-- This was previously applied by hand and never tracked here; committing it
-- keeps the live database and this repository in step.

begin;

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
  v_phone text;
begin
  if pg_catalog.coalesce(new.raw_user_meta_data ->> 'account_type', '') <> 'customer' then
    return new;
  end if;

  v_full_name := pg_catalog.btrim(
    pg_catalog.coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  v_phone := pg_catalog.regexp_replace(
    pg_catalog.coalesce(new.raw_user_meta_data ->> 'phone', ''),
    '[[:space:]()-]',
    '',
    'g'
  );

  insert into public.customers (
    auth_user_id,
    full_name,
    phone,
    email
  )
  values (
    new.id,
    v_full_name,
    v_phone,
    pg_catalog.lower(new.email)
  );

  return new;
end;
$$;

revoke all on function public.handle_new_customer() from public;

-- Postgres checks EXECUTE on a trigger function against the role performing the
-- INSERT. Supabase Auth inserts as supabase_auth_admin, which held that right
-- only through PUBLIC; without this grant every signup fails with the opaque
-- "Database error saving new user".
grant execute on function public.handle_new_customer() to supabase_auth_admin;

drop trigger if exists on_auth_customer_created on auth.users;

create trigger on_auth_customer_created
after insert on auth.users
for each row execute function public.handle_new_customer();

commit;
