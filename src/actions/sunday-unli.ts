"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import type { BookingActionState } from "@/lib/booking-form-state";
import { ensureCustomerProfile } from "@/lib/data/customers";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function paymentConfigured() {
  return Boolean(
    process.env.GCASH_ACCOUNT_NAME?.trim() &&
      process.env.GCASH_MOBILE_NUMBER?.trim(),
  );
}

export async function createSundayUnliSignupAction(
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/sunday-unli?session=${encodeURIComponent(sessionId)}`;
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  if (!UUID_PATTERN.test(sessionId)) {
    return failure("That Sunday Unli session is invalid.");
  }

  if (!paymentConfigured()) {
    return failure(
      "Online registration is not accepting payments yet. Please check back later.",
    );
  }

  const customerId = await ensureCustomerProfile();

  if (!customerId) {
    return failure(
      "Your customer profile is incomplete. Sign out and create your account again.",
    );
  }

  const { data, error } = await supabase.rpc("create_sunday_unli_signup", {
    p_session_id: sessionId,
  });

  if (error || !data || typeof data !== "object") {
    return failure(
      "This Sunday Unli session is no longer accepting registrations. Refresh the schedule and try again.",
    );
  }

  const result = data as {
    reference?: unknown;
    status?: unknown;
    has_payment?: unknown;
  };
  const reference =
    typeof result.reference === "string" ? result.reference : "";

  if (!/^TPC-\d{4}-\d{4,}$/.test(reference)) {
    return failure("The registration could not be created. Please try again.");
  }

  if (result.has_payment === true || result.status === "confirmed") {
    redirect(`/sunday-unli/confirmation/${encodeURIComponent(reference)}`);
  }

  redirect(`/sunday-unli/payment/${encodeURIComponent(reference)}`);
}

export async function submitSundayUnliPaymentProofAction(
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const reference = String(formData.get("sundayUnliReference") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/sunday-unli/payment/${reference}`)}`,
    );
  }

  if (!paymentConfigured()) {
    return failure("GCash payment details are not configured yet.");
  }

  const gcashReference = String(formData.get("gcashReference") ?? "").trim();
  const receipt = formData.get("receipt");

  if (!/^TPC-\d{4}-\d{4,}$/.test(reference)) {
    return failure("That Sunday Unli reference is invalid.");
  }

  if (!/^\d{6,30}$/.test(gcashReference)) {
    return failure("Enter the numeric GCash reference number from your receipt.");
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

  const { data: signup } = await supabase
    .from("sunday_unli_signups")
    .select("id, status, hold_expires_at, payment_proof_submitted_at")
    .eq("reference", reference)
    .maybeSingle();

  if (
    !signup ||
    signup.status !== "pending" ||
    signup.payment_proof_submitted_at ||
    !signup.hold_expires_at ||
    new Date(signup.hold_expires_at) <= new Date()
  ) {
    return failure(
      "This payment hold has expired. Return to the event and register again.",
    );
  }

  const receiptPath = `${user.id}/sunday-unli/${signup.id}/${randomUUID()}.${extension}`;
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
    "submit_sunday_unli_payment",
    {
      p_signup_id: signup.id,
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

  redirect(`/sunday-unli/confirmation/${encodeURIComponent(reference)}`);
}
