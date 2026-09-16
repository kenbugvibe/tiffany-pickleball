"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import type { BookingActionState } from "@/lib/booking-form-state";
import { ensureCustomerProfile } from "@/lib/data/customers";
import { createClient } from "@/lib/supabase/server";

const RECEIPT_BUCKET = "payment-receipts";
const MAX_RECEIPT_BYTES = 1024 * 1024;
const RECEIPT_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function failure(error: string): BookingActionState {
  return { error };
}

function parseInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseTimestamp(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function bookingError(code: string | undefined) {
  if (code === "23P01") {
    return "One of those times was just reserved. Choose another available time.";
  }

  return "We could not hold that booking. Refresh the schedule and try again.";
}

export async function createBookingHoldAction(
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=%2Fbook");
  }

  if (
    !process.env.GCASH_ACCOUNT_NAME?.trim() ||
    !process.env.GCASH_MOBILE_NUMBER?.trim()
  ) {
    return failure(
      "Online booking is not accepting payments yet. Please check back later.",
    );
  }

  const courtId = parseInteger(formData.get("courtId"));
  const paddleCount = parseInteger(formData.get("paddleCount"));
  const startsAt = parseTimestamp(formData.get("startsAt"));
  const endsAt = parseTimestamp(formData.get("endsAt"));

  if (
    !courtId ||
    paddleCount === null ||
    !startsAt ||
    !endsAt ||
    startsAt >= endsAt ||
    startsAt <= new Date()
  ) {
    return failure("Choose a valid future court time before continuing.");
  }

  const durationHours = (endsAt.valueOf() - startsAt.valueOf()) / 3_600_000;

  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 16) {
    return failure("Choose consecutive whole-hour slots on the same day.");
  }

  const customerId = await ensureCustomerProfile();

  if (!customerId) {
    return failure(
      "Your customer profile is incomplete. Sign out and create your account again.",
    );
  }

  const { data: court } = await supabase
    .from("courts")
    .select("id")
    .eq("id", courtId)
    .eq("is_active", true)
    .maybeSingle();

  if (!court) {
    return failure("That court is not available for booking.");
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      customer_id: customerId,
      court_id: courtId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      kind: "regular",
      paddle_count: paddleCount,
      status: "pending",
    })
    .select("reference")
    .single();

  if (error || !booking) {
    return failure(bookingError(error?.code));
  }

  redirect(`/book/payment/${encodeURIComponent(booking.reference)}`);
}

export async function submitPaymentProofAction(
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const reference = String(formData.get("bookingReference") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/book/payment/${reference}`)}`,
    );
  }

  if (
    !process.env.GCASH_ACCOUNT_NAME?.trim() ||
    !process.env.GCASH_MOBILE_NUMBER?.trim()
  ) {
    return failure("GCash payment details are not configured yet.");
  }

  const gcashReference = String(formData.get("gcashReference") ?? "").trim();
  const customerNote = String(formData.get("customerNote") ?? "").trim();
  const receipt = formData.get("receipt");

  if (!/^TPC-\d{4}-\d{4,}$/.test(reference)) {
    return failure("That booking reference is invalid.");
  }

  if (!/^\d{6,30}$/.test(gcashReference)) {
    return failure("Enter the numeric GCash reference number from your receipt.");
  }

  if (customerNote.length > 500) {
    return failure("Keep the note to 500 characters or fewer.");
  }

  if (!(receipt instanceof File) || receipt.size === 0) {
    return failure("Choose a receipt screenshot to upload.");
  }

  const extension = RECEIPT_TYPES.get(receipt.type);

  if (!extension) {
    return failure("Use a JPEG, PNG, or WebP receipt image.");
  }

  if (receipt.size > MAX_RECEIPT_BYTES) {
    return failure("The compressed receipt must be smaller than 1 MB.");
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, hold_expires_at, payment_proof_submitted_at")
    .eq("reference", reference)
    .eq("kind", "regular")
    .maybeSingle();

  if (
    !booking ||
    booking.status !== "pending" ||
    booking.payment_proof_submitted_at ||
    !booking.hold_expires_at ||
    new Date(booking.hold_expires_at) <= new Date()
  ) {
    return failure("This payment hold has expired. Please choose the time again.");
  }

  const receiptPath = `${user.id}/${booking.id}/${randomUUID()}.${extension}`;
  const receiptBytes = new Uint8Array(await receipt.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(receiptPath, receiptBytes, {
      cacheControl: "3600",
      contentType: receipt.type,
      upsert: false,
    });

  if (uploadError) {
    return failure("The receipt could not be uploaded. Please try again.");
  }

  const { error: paymentError } = await supabase.rpc(
    "submit_booking_payment",
    {
      p_booking_id: booking.id,
      p_customer_note: customerNote || null,
      p_gcash_ref: gcashReference,
      p_receipt_path: receiptPath,
    },
  );

  if (paymentError) {
    await supabase.storage.from(RECEIPT_BUCKET).remove([receiptPath]);

    return failure(
      "We could not attach the receipt. Check that the hold is still active and try again.",
    );
  }

  redirect(`/book/confirmation/${encodeURIComponent(reference)}`);
}
