import "server-only";

import { createClient } from "@/lib/supabase/server";

type CourtRelation = { name: string } | { name: string }[] | null;
type CustomerRelation = { full_name: string } | { full_name: string }[] | null;

export type CustomerBooking = {
  id: string;
  reference: string;
  court_id: number;
  court_name: string;
  customer_name: string | null;
  starts_at: string;
  ends_at: string;
  paddle_count: number;
  court_fee: number;
  paddle_fee: number;
  total_amount: number;
  status: string;
  payment_proof_submitted_at: string | null;
  customer_note: string | null;
  payment: {
    id: string;
    gcash_ref: string;
    receipt_path: string;
    status: string;
    created_at: string;
  } | null;
};

function courtName(courts: CourtRelation) {
  if (Array.isArray(courts)) {
    return courts[0]?.name ?? "Court";
  }

  return courts?.name ?? "Court";
}

function customerName(customers: CustomerRelation) {
  const customer = Array.isArray(customers) ? customers[0] : customers;
  return customer?.full_name?.trim() || null;
}

export async function getCustomerBooking(reference: string) {
  const supabase = await createClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, reference, court_id, starts_at, ends_at, paddle_count, court_fee, paddle_fee, total_amount, status, payment_proof_submitted_at, customer_note, courts(name), customers(full_name)",
    )
    .eq("reference", reference)
    .eq("kind", "regular")
    .maybeSingle();

  if (error || !booking) {
    return null;
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, gcash_ref, receipt_path, status, created_at")
    .eq("booking_id", booking.id)
    .maybeSingle();

  return {
    ...booking,
    court_name: courtName(booking.courts as CourtRelation),
    customer_name: customerName(booking.customers as CustomerRelation),
    payment: payment ?? null,
  } as CustomerBooking;
}
