-- Repair submit_booking_payment after the no-hold migration incorrectly
-- schema-qualified COALESCE. COALESCE is SQL syntax, not a pg_catalog function.

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
     or pg_catalog.strpos(p_receipt_path, '..') > 0 then
    raise exception 'Receipt path is invalid';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'payment-receipts'
      and object.name = p_receipt_path
  ) then
    raise exception 'Receipt file does not exist';
  end if;

  if pg_catalog.length(coalesce(p_customer_note, '')) > 500 then
    raise exception 'Customer note is too long';
  end if;

  update public.bookings booking
  set customer_note = nullif(
    pg_catalog.btrim(coalesce(p_customer_note, '')),
    ''
  )
  from public.customers customer
  where booking.id = p_booking_id
    and booking.customer_id = customer.id
    and customer.auth_user_id = (select auth.uid())
    and booking.kind = 'regular'
    and booking.status = 'pending'
    and booking.payment_proof_submitted_at is null;

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

commit;
