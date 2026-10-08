-- Let customers cancel their own unpaid court bookings, so the 2-unpaid
-- booking limit can never lock them out. Only bookings with no receipt can be
-- cancelled this way; paid bookings still go through Tiffany.

begin;

create or replace function public.cancel_my_unpaid_booking(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := public.current_customer_id();
  v_booking public.bookings%rowtype;
begin
  if v_customer_id is null then
    raise exception 'Customer profile is required'
      using errcode = '42501';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
    and customer_id = v_customer_id
  for update;

  if not found
     or v_booking.kind <> 'regular'
     or v_booking.status <> 'pending' then
    raise exception 'Only your own pending court booking can be cancelled';
  end if;

  if v_booking.payment_proof_submitted_at is not null
     or exists (
       select 1
       from public.payments payment
       where payment.booking_id = p_booking_id
         and payment.status in ('unverified', 'verified')
     ) then
    raise exception 'This booking has a receipt. Contact Tiffany''s to change it';
  end if;

  update public.bookings
  set
    status = 'cancelled',
    internal_note = case
      when internal_note is null or pg_catalog.btrim(internal_note) = ''
        then 'Cancelled by the customer before paying'
      else internal_note || E'\nCancelled by the customer before paying'
    end
  where id = p_booking_id;

  return v_booking.reference;
end;
$$;

revoke all on function public.cancel_my_unpaid_booking(uuid) from public, anon;

grant execute on function public.cancel_my_unpaid_booking(uuid)
to authenticated, service_role;

commit;
