import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type OneOrMany<T> = T | T[] | null;

type CourtRelation = { name: string };

type PaymentRelation = {
  id: string;
  status: string;
  gcash_ref: string;
  created_at: string;
};

type CourtBookingRow = {
  id: string;
  reference: string;
  starts_at: string;
  ends_at: string;
  paddle_count: number;
  total_amount: number;
  status: string;
  hold_expires_at: string | null;
  payment_proof_submitted_at: string | null;
  courts: OneOrMany<CourtRelation>;
  payments: OneOrMany<PaymentRelation>;
};

type SignupRow = {
  id: string;
  reference: string;
  session_id: string;
  amount_due: number;
  status: string;
  hold_expires_at: string | null;
  payment_proof_submitted_at: string | null;
  payments: OneOrMany<PaymentRelation>;
};

type OpenPlaySessionRow = {
  session_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  court_names: string[];
};

type SundayUnliSessionRow = {
  session_id: string;
  starts_at: string;
  ends_at: string;
  court_names: string[];
};

export type MyBookingKind =
  | "court_booking"
  | "open_play"
  | "sunday_unli";

export type MyBookingDisplayStatus =
  | "awaiting_payment"
  | "pending_verification"
  | "confirmed"
  | "cancelled"
  | "refund_pending"
  | "refunded"
  | "expired"
  | "no_show";

export type MyBookingItem = {
  id: string;
  reference: string;
  kind: MyBookingKind;
  title: string;
  startsAt: string;
  endsAt: string;
  courtNames: string[];
  amount: number;
  paddleCount: number | null;
  reservationStatus: string;
  paymentStatus: string | null;
  gcashReference: string | null;
  displayStatus: MyBookingDisplayStatus;
  actionHref: string | null;
  actionLabel: string | null;
};

function one<T>(value: OneOrMany<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function displayStatus(
  reservationStatus: string,
  paymentStatus: string | null,
  holdExpiresAt: string | null,
  evaluatedAt: number,
): MyBookingDisplayStatus {
  if (paymentStatus === "refund_pending") return "refund_pending";
  if (paymentStatus === "refunded") return "refunded";
  if (reservationStatus === "no_show") return "no_show";
  if (reservationStatus === "cancelled" || paymentStatus === "rejected") {
    return "cancelled";
  }
  if (reservationStatus === "confirmed" && paymentStatus === "verified") {
    return "confirmed";
  }
  if (!paymentStatus) {
    if (!holdExpiresAt || new Date(holdExpiresAt).valueOf() <= evaluatedAt) {
      return "expired";
    }

    return "awaiting_payment";
  }

  return "pending_verification";
}

function actionFor(
  kind: MyBookingKind,
  reference: string,
  status: MyBookingDisplayStatus,
  hasPayment: boolean,
) {
  const root =
    kind === "court_booking"
      ? "/book"
      : kind === "open_play"
        ? "/open-play"
        : "/sunday-unli";
  const encodedReference = encodeURIComponent(reference);

  if (hasPayment) {
    return {
      href: `${root}/confirmation/${encodedReference}`,
      label: "View details",
    };
  }

  if (status === "awaiting_payment") {
    return {
      href: `${root}/payment/${encodedReference}`,
      label: "Continue payment",
    };
  }

  return { href: null, label: null };
}

export async function getMyBookingsData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=%2Fmy-bookings");
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (customerError) {
    return {
      ok: false as const,
      error: "Your bookings could not be loaded. Please refresh and try again.",
    };
  }

  if (!customer) {
    return {
      ok: true as const,
      profileMissing: true as const,
      customerName: user.email ?? "Customer",
      items: [] as MyBookingItem[],
    };
  }

  const [courtResult, openPlayResult, sundayUnliResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, reference, starts_at, ends_at, paddle_count, total_amount, status, hold_expires_at, payment_proof_submitted_at, courts(name), payments(id, status, gcash_ref, created_at)",
      )
      .eq("customer_id", customer.id)
      .eq("kind", "regular")
      .order("starts_at", { ascending: false }),
    supabase
      .from("open_play_signups")
      .select(
        "id, reference, session_id, amount_due, status, hold_expires_at, payment_proof_submitted_at, payments(id, status, gcash_ref, created_at)",
      )
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("sunday_unli_signups")
      .select(
        "id, reference, session_id, amount_due, status, hold_expires_at, payment_proof_submitted_at, payments(id, status, gcash_ref, created_at)",
      )
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false }),
  ]);

  if (courtResult.error || openPlayResult.error || sundayUnliResult.error) {
    return {
      ok: false as const,
      error: "Your bookings could not be loaded. Please refresh and try again.",
    };
  }

  const courtRows = (courtResult.data ?? []) as unknown as CourtBookingRow[];
  const openPlayRows = (openPlayResult.data ?? []) as unknown as SignupRow[];
  const sundayUnliRows = (sundayUnliResult.data ?? []) as unknown as SignupRow[];
  const evaluatedAt = Date.now();
  const openPlaySessionIds = Array.from(
    new Set(openPlayRows.map((signup) => signup.session_id)),
  );
  const sundayUnliSessionIds = Array.from(
    new Set(sundayUnliRows.map((signup) => signup.session_id)),
  );
  const [openPlaySessions, sundayUnliSessions] = await Promise.all([
    Promise.all(
      openPlaySessionIds.map(async (sessionId) => {
        const result = await supabase.rpc("get_open_play_session", {
          p_session_id: sessionId,
        });
        const row = Array.isArray(result.data)
          ? (result.data[0] as OpenPlaySessionRow | undefined)
          : undefined;

        return { sessionId, row, error: result.error };
      }),
    ),
    Promise.all(
      sundayUnliSessionIds.map(async (sessionId) => {
        const result = await supabase.rpc("get_sunday_unli_session", {
          p_session_id: sessionId,
        });
        const row = Array.isArray(result.data)
          ? (result.data[0] as SundayUnliSessionRow | undefined)
          : undefined;

        return { sessionId, row, error: result.error };
      }),
    ),
  ]);

  if (
    openPlaySessions.some((session) => session.error || !session.row) ||
    sundayUnliSessions.some((session) => session.error || !session.row)
  ) {
    return {
      ok: false as const,
      error: "One or more event registrations could not be loaded. Please refresh and try again.",
    };
  }

  const openPlayById = new Map(
    openPlaySessions.map((session) => [session.sessionId, session.row!]),
  );
  const sundayUnliById = new Map(
    sundayUnliSessions.map((session) => [session.sessionId, session.row!]),
  );
  const courtItems = courtRows.map((booking) => {
    const payment = one(booking.payments);
    const status = displayStatus(
      booking.status,
      payment?.status ?? null,
      booking.hold_expires_at,
      evaluatedAt,
    );
    const action = actionFor(
      "court_booking",
      booking.reference,
      status,
      Boolean(payment),
    );

    return {
      id: booking.id,
      reference: booking.reference,
      kind: "court_booking",
      title: one(booking.courts)?.name ?? "Court booking",
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      courtNames: [one(booking.courts)?.name ?? "Court"],
      amount: Number(booking.total_amount),
      paddleCount: booking.paddle_count,
      reservationStatus: booking.status,
      paymentStatus: payment?.status ?? null,
      gcashReference: payment?.gcash_ref ?? null,
      displayStatus: status,
      actionHref: action.href,
      actionLabel: action.label,
    } satisfies MyBookingItem;
  });
  const openPlayItems = openPlayRows.map((signup) => {
    const session = openPlayById.get(signup.session_id)!;
    const payment = one(signup.payments);
    const status = displayStatus(
      signup.status,
      payment?.status ?? null,
      signup.hold_expires_at,
      evaluatedAt,
    );
    const action = actionFor(
      "open_play",
      signup.reference,
      status,
      Boolean(payment),
    );

    return {
      id: signup.id,
      reference: signup.reference,
      kind: "open_play",
      title: session.title,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      courtNames: session.court_names ?? [],
      amount: Number(signup.amount_due),
      paddleCount: null,
      reservationStatus: signup.status,
      paymentStatus: payment?.status ?? null,
      gcashReference: payment?.gcash_ref ?? null,
      displayStatus: status,
      actionHref: action.href,
      actionLabel: action.label,
    } satisfies MyBookingItem;
  });
  const sundayUnliItems = sundayUnliRows.map((signup) => {
    const session = sundayUnliById.get(signup.session_id)!;
    const payment = one(signup.payments);
    const status = displayStatus(
      signup.status,
      payment?.status ?? null,
      signup.hold_expires_at,
      evaluatedAt,
    );
    const action = actionFor(
      "sunday_unli",
      signup.reference,
      status,
      Boolean(payment),
    );

    return {
      id: signup.id,
      reference: signup.reference,
      kind: "sunday_unli",
      title: "Sunday Unli Play",
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      courtNames: session.court_names ?? [],
      amount: Number(signup.amount_due),
      paddleCount: null,
      reservationStatus: signup.status,
      paymentStatus: payment?.status ?? null,
      gcashReference: payment?.gcash_ref ?? null,
      displayStatus: status,
      actionHref: action.href,
      actionLabel: action.label,
    } satisfies MyBookingItem;
  });

  return {
    ok: true as const,
    profileMissing: false as const,
    customerName: customer.full_name,
    items: [...courtItems, ...openPlayItems, ...sundayUnliItems],
    evaluatedAt,
  };
}
