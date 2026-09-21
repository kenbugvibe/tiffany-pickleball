import "server-only";

import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SundayUnliSessionRpcRow = {
  session_id: string;
  session_reference: string;
  price_per_player: number;
  customer_note: string | null;
  starts_at: string;
  ends_at: string;
  court_names: string[];
};

type PaymentRow = {
  id: string;
  gcash_ref: string;
  receipt_path: string;
  status: string;
  created_at: string;
};

export type PublishedSundayUnliSession = {
  id: string;
  reference: string;
  pricePerPlayer: number;
  customerNote: string | null;
  startsAt: string;
  endsAt: string;
  courtNames: string[];
};

export type CustomerSundayUnliSignup = {
  id: string;
  reference: string;
  sessionId: string;
  amountDue: number;
  status: string;
  holdExpiresAt: string | null;
  paymentProofSubmittedAt: string | null;
  session: PublishedSundayUnliSession;
  payment: PaymentRow | null;
};

function mapSession(
  row: SundayUnliSessionRpcRow,
): PublishedSundayUnliSession {
  return {
    id: row.session_id,
    reference: row.session_reference,
    pricePerPlayer: Number(row.price_per_player),
    customerNote: row.customer_note,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    courtNames: row.court_names ?? [],
  };
}

export async function getPublishedSundayUnliSession(sessionId: string) {
  if (!UUID_PATTERN.test(sessionId)) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_sunday_unli_session", {
    p_session_id: sessionId,
  });
  const row = Array.isArray(data)
    ? (data[0] as SundayUnliSessionRpcRow | undefined)
    : undefined;

  if (error || !row) {
    return null;
  }

  return mapSession(row);
}

export async function getActiveSundayUnliSignupForSession(sessionId: string) {
  if (!UUID_PATTERN.test(sessionId)) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sunday_unli_signups")
    .select("reference, status, hold_expires_at, payment_proof_submitted_at")
    .eq("session_id", sessionId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return error ? null : data;
}

export async function getCustomerSundayUnliSignup(reference: string) {
  if (!/^TPC-\d{4}-\d{4,}$/.test(reference)) {
    return null;
  }

  const supabase = await createClient();
  const { data: signup, error } = await supabase
    .from("sunday_unli_signups")
    .select(
      "id, reference, session_id, amount_due, status, hold_expires_at, payment_proof_submitted_at",
    )
    .eq("reference", reference)
    .maybeSingle();

  if (error || !signup) {
    return null;
  }

  const [sessionResult, paymentResult] = await Promise.all([
    supabase.rpc("get_sunday_unli_session", {
      p_session_id: signup.session_id,
    }),
    supabase
      .from("payments")
      .select("id, gcash_ref, receipt_path, status, created_at")
      .eq("sunday_unli_signup_id", signup.id)
      .maybeSingle(),
  ]);
  const sessionRow = Array.isArray(sessionResult.data)
    ? (sessionResult.data[0] as SundayUnliSessionRpcRow | undefined)
    : undefined;

  if (sessionResult.error || !sessionRow) {
    return null;
  }

  return {
    id: signup.id,
    reference: signup.reference,
    sessionId: signup.session_id,
    amountDue: Number(signup.amount_due),
    status: signup.status,
    holdExpiresAt: signup.hold_expires_at,
    paymentProofSubmittedAt: signup.payment_proof_submitted_at,
    session: mapSession(sessionRow),
    payment: (paymentResult.data as PaymentRow | null) ?? null,
  } satisfies CustomerSundayUnliSignup;
}
