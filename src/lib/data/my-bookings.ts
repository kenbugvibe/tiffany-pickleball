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
  payment_proof_submitted_at: string | null;
  payments: OneOrMany<PaymentRelation>;
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
  | "reschedule_due"
  | "rescheduled"
  | "refunded"
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
): MyBookingDisplayStatus {
  if (paymentStatus === "reschedule_due") return "reschedule_due";
  if (paymentStatus === "rescheduled") return "rescheduled";
  if (paymentStatus === "refunded") return "refunded";
  if (reservationStatus === "no_show") return "no_show";
  if (reservationStatus === "cancelled" || paymentStatus === "rejected") {
    return "cancelled";
  }
  if (reservationStatus === "confirmed" && paymentStatus === "verified") {
    return "confirmed";
  }
  if (!paymentStatus) {
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
        "id, reference, starts_at, ends_at, paddle_count, total_amount, status, payment_proof_submitted_at, courts(name), payments(id, status, gcash_ref, created_at)",
      )
      .eq("customer_id", customer.id)
      .eq("kind", "regular")
      .order("starts_at", { ascending: false }),
    supabase
      .from("open_play_signups")
      .select(
        "id, reference, session_id, amount_due, status, payment_proof_submitted_at, payments(id, status, gcash_ref, created_at)",
      )
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("sunday_unli_signups")
      .select(
        "id, reference, session_id, amount_due, status, payment_proof_submitted_at, payments(id, status, gcash_ref, created_at)",
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
  // One call returns every event session this customer registered for,
  // including cancelled ones, so past registrations always display.
  const hasEvents = openPlayRows.length > 0 || sundayUnliRows.length > 0;
  const sessionsResult = hasEvents
    ? await supabase.rpc("get_my_event_sessions")
    : { data: [], error: null };

  if (sessionsResult.error) {
    return {
      ok: false as const,
      error: "One or more event registrations could not be loaded. Please refresh and try again.",
    };
  }

  type EventSessionRow = {
    kind: "open_play" | "sunday_unli";
    session_id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    court_names: string[] | null;
  };
  const sessions = (sessionsResult.data ?? []) as EventSessionRow[];
  const openPlayById = new Map(
    sessions
      .filter((session) => session.kind === "open_play")
      .map((session) => [session.session_id, session]),
  );
  const sundayUnliById = new Map(
    sessions
      .filter((session) => session.kind === "sunday_unli")
      .map((session) => [session.session_id, session]),
  );

  if (
    openPlayRows.some((signup) => !openPlayById.has(signup.session_id)) ||
    sundayUnliRows.some((signup) => !sundayUnliById.has(signup.session_id))
  ) {
    return {
      ok: false as const,
      error: "One or more event registrations could not be loaded. Please refresh and try again.",
    };
  }

  const courtItems = courtRows.map((booking) => {
    const payment = one(booking.payments);
    const status = displayStatus(
      booking.status,
      payment?.status ?? null,
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
