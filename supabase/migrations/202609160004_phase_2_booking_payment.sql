-- Phase 2 - atomically attach a customer's receipt to a pending booking.

begin;

create or replace function public.submit_booking_payment(
  p_booking_id uuid,
  p_gcash_ref text,
  p_receipt_path text,
  p_customer_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  if pg_catalog.length(pg_catalog.btrim(p_gcash_ref)) < 6 then
    raise exception 'GCash reference is required';
  end if;

  if p_receipt_path is null
     or pg_catalog.split_part(p_receipt_path, '/', 1) <> (select auth.uid())::text
     or position('..' in p_receipt_path) > 0 then
    raise exception 'Receipt path is invalid';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'payment-receipts'
      and o.name = p_receipt_path
  ) then
    raise exception 'Receipt file does not exist';
  end if;

  if pg_catalog.length(pg_catalog.coalesce(p_customer_note, '')) > 500 then
    raise exception 'Customer note is too long';
  end if;

  update public.bookings b
  set customer_note = nullif(
    pg_catalog.btrim(pg_catalog.coalesce(p_customer_note, '')),
    ''
  )
  from public.customers c
  where b.id = p_booking_id
    and b.customer_id = c.id
    and c.auth_user_id = (select auth.uid())
    and b.kind = 'regular'
    and b.status = 'pending'
    and b.payment_proof_submitted_at is null
    and b.hold_expires_at > pg_catalog.statement_timestamp();

  if not found then
    raise exception 'Booking is not awaiting payment';
  end if;

  insert into public.payments (
    booking_id,
    gcash_ref,
    receipt_path
  )
  values (
    p_booking_id,
    pg_catalog.btrim(p_gcash_ref),
    p_receipt_path
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

revoke all on function public.submit_booking_payment(uuid, text, text, text)
from public;

grant execute on function public.submit_booking_payment(uuid, text, text, text)
to authenticated, service_role;

create policy receipt_owner_delete_unattached
on storage.objects for delete
to authenticated
using (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1
    from public.payments p
    where p.receipt_path = name
  )
);

commit;
