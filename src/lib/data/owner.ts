import "server-only";

import type { CourtBlockSelection } from "@/lib/court-blocks";
import { manilaHourToIso } from "@/lib/court-blocks";
import { addDaysToIsoDate, getTodayInManila, getWeekDays } from "@/lib/dates";
import { isCustomerEmailConfigured } from "@/lib/notifications/court-blocked";
import { requireOwner } from "@/lib/owner-auth";
import { createClient } from "@/lib/supabase/server";

type OneOrMany<T> = T | T[] | null;

type CustomerRelation = {
  full_name: string;
  phone: string;
  email: string;
};

type CourtRelation = { name: string };

type OpenPlayRelation = {
  id: string;
  reference: string;
  title: string;
  price_per_player: number;
  is_published: boolean;
};

type OpenPlayCourtRelation = {
  open_play_sessions: OneOrMany<OpenPlayRelation>;
};

type SundayUnliRelation = {
  id: string;
  reference: string;
  price_per_player: number;
  status: string;
};

type BookingRow = {
  id: string;
  reference: string;
  court_id: number;
  starts_at: string;
  ends_at: string;
  kind: string;
  status: string;
  total_amount: number;
  paddle_count: number;
  block_reason: string | null;
  customers: OneOrMany<CustomerRelation>;
  courts: OneOrMany<CourtRelation>;
  open_play_session_courts?: OneOrMany<OpenPlayCourtRelation>;
  sunday_unli_sessions?: OneOrMany<SundayUnliRelation>;
  payments?: OneOrMany<{ id: string; status: string }>;
};

type PaymentRow = {
  id: string;
  booking_id: string | null;
  open_play_signup_id: string | null;
  sunday_unli_signup_id: string | null;
  amount: number;
  gcash_ref: string;
  receipt_path: string;
  created_at: string;
};

type ReviewParent = {
  reference: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  courtName: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  typeLabel: string;
};

export type OwnerTimelineBooking = {
  id: string;
  reference: string;
  courtId: number;
  courtName: string;
  startsAt: string;
  endsAt: string;
  startMinute: number;
  endMinute: number;
  kind: string;
  status: string;
  customerName: string | null;
  blockReason: string | null;
  openPlaySessionId: string | null;
  openPlayReference: string | null;
  openPlayTitle: string | null;
  openPlayPrice: number | null;
  openPlayIsPublished: boolean;
  sundayUnliSessionId: string | null;
  sundayUnliReference: string | null;
  sundayUnliPrice: number | null;
  sundayUnliStatus: string | null;
  /** Null means the customer has not uploaded a receipt yet. */
  paymentStatus: string | null;
};

export type OwnerPendingPayment = ReviewParent & {
  id: string;
  amount: number;
  gcashRef: string;
  createdAt: string;
  receiptUrl: string | null;
  /** Only ordinary court bookings can be moved with the Reschedule tool. */
  isCourtBooking: boolean;
};

export type OwnerCalendarDaySummary = {
  date: string;
  entryCount: number;
  pendingCount: number;
  blockedCount: number;
  hasOpenPlay: boolean;
  hasSundayUnli: boolean;
  occupancyPercent: number;
};

export type OwnerCourtBlockConflict = {
  id: string;
  reference: string;
  courtName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  startsAt: string;
  endsAt: string;
  status: string;
  paymentStatus: string | null;
  paymentAmount: number;
  /** A submitted payment means the booking must be rescheduled, not cancelled. */
  needsReschedule: boolean;
};

export type OwnerCourtBlockSpecialConflict = {
  id: string;
  reference: string;
  courtName: string;
  kind: string;
  label: string;
  startsAt: string;
  endsAt: string;
};

export type OwnerCourtBlockPreview = {
  selection: CourtBlockSelection;
  courtNames: string[];
  startsAt: string;
  endsAt: string;
  error: string | null;
  emailConfigured: boolean;
  affectedBookings: OwnerCourtBlockConflict[];
  specialConflicts: OwnerCourtBlockSpecialConflict[];
};

function one<T>(value: OneOrMany<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Bookings never cross midnight, so anything overlapping a period starts no
 * earlier than a day before it. This lower bound lets the starts_at index
 * skip older history instead of scanning every past booking.
 */
function earliestOverlappingStart(periodStartIso: string) {
  return new Date(
    new Date(periodStartIso).getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();
}

function manilaDayBounds(day: string) {
  const start = new Date(`${day}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

type EmbeddedCustomer = OneOrMany<CustomerRelation>;

type PendingPaymentRow = PaymentRow & {
  bookings: OneOrMany<{
    reference: string;
    starts_at: string;
    ends_at: string;
    customer_note: string | null;
    courts: OneOrMany<CourtRelation>;
    customers: EmbeddedCustomer;
  }>;
  open_play_signups: OneOrMany<{
    reference: string;
    customers: EmbeddedCustomer;
    open_play_sessions: OneOrMany<{
      title: string;
      bookings: OneOrMany<{
        starts_at: string;
        ends_at: string;
        courts: OneOrMany<CourtRelation>;
      }>;
    }>;
  }>;
  sunday_unli_signups: OneOrMany<{
    reference: string;
    customers: EmbeddedCustomer;
    sunday_unli_sessions: OneOrMany<{ starts_at: string; ends_at: string }>;
  }>;
};

/** Embedded with the payment so the queue loads in one query. */
const PENDING_PAYMENT_SELECT =
  "id, booking_id, open_play_signup_id, sunday_unli_signup_id, amount, gcash_ref, receipt_path, created_at, " +
  "bookings(reference, starts_at, ends_at, customer_note, courts(name), customers(full_name, phone, email)), " +
  "open_play_signups(reference, customers(full_name, phone, email), open_play_sessions(title, bookings(starts_at, ends_at, courts(name)))), " +
  "sunday_unli_signups(reference, customers(full_name, phone, email), sunday_unli_sessions(starts_at, ends_at))";

function customerFields(customers: EmbeddedCustomer) {
  const customer = one(customers);

  return {
    customerName: customer?.full_name ?? "Customer",
    customerPhone: customer?.phone ?? "Not available",
    customerEmail: customer?.email ?? "Not available",
  };
}

function reviewParentFromRow(payment: PendingPaymentRow): ReviewParent | null {
  if (payment.booking_id) {
    const booking = one(payment.bookings);

    if (!booking) return null;

    return {
      reference: booking.reference,
      ...customerFields(booking.customers),
      courtName: one(booking.courts)?.name ?? "Court",
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      note: booking.customer_note,
      typeLabel: "Court booking",
    };
  }

  if (payment.open_play_signup_id) {
    const signup = one(payment.open_play_signups);
    const session = one(signup?.open_play_sessions ?? null);
    const booking = one(session?.bookings ?? null);

    if (!signup || !booking) return null;

    return {
      reference: signup.reference,
      ...customerFields(signup.customers),
      courtName: one(booking.courts)?.name ?? "Court",
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      note: null,
      typeLabel: session?.title ?? "Open play",
    };
  }

  if (payment.sunday_unli_signup_id) {
    const signup = one(payment.sunday_unli_signups);
    const session = one(signup?.sunday_unli_sessions ?? null);

    if (!signup || !session) return null;

    return {
      reference: signup.reference,
      ...customerFields(signup.customers),
      courtName: "All courts",
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      note: null,
      typeLabel: "Sunday unli play",
    };
  }

  return null;
}

export async function getOwnerTodayData() {
  await requireOwner();

  const supabase = await createClient();
  const today = getTodayInManila();
  const bounds = manilaDayBounds(today);

  const [
    courtsResult,
    settingsResult,
    bookingsResult,
    revenueResult,
    paymentsResult,
  ] = await Promise.all([
    supabase
      .from("courts")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("id"),
    supabase
      .from("business_settings")
      .select("opening_hour, closing_hour")
      .eq("id", 1)
      .single(),
    supabase
      .from("bookings")
      .select(
        "id, reference, court_id, starts_at, ends_at, kind, status, total_amount, paddle_count, block_reason, customers(full_name, phone, email), courts(name), open_play_session_courts(open_play_sessions(id, reference, title, price_per_player, is_published)), sunday_unli_sessions(id, reference, price_per_player, status), payments(id, status)",
      )
      .gte("starts_at", earliestOverlappingStart(bounds.startIso))
      .lt("starts_at", bounds.endIso)
      .gt("ends_at", bounds.startIso)
      .not("status", "in", "(cancelled,no_show)")
      .order("starts_at"),
    supabase.rpc("get_owner_collected_for_day", { p_day: today }),
    supabase
      .from("payments")
      .select(PENDING_PAYMENT_SELECT, { count: "exact" })
      .eq("status", "unverified")
      .order("created_at"),
  ]);

  const requiredResults = [
    courtsResult,
    settingsResult,
    bookingsResult,
    revenueResult,
    paymentsResult,
  ];

  if (requiredResults.some((result) => result.error)) {
    throw new Error("The owner dashboard data could not be loaded.");
  }

  const courts = (courtsResult.data ?? []) as Array<{
    id: number;
    name: string;
    is_active: boolean;
  }>;
  const settings = settingsResult.data as {
    opening_hour: number;
    closing_hour: number;
  };
  const bookingRows = (bookingsResult.data ?? []) as unknown as BookingRow[];
  const paymentRows = (paymentsResult.data ?? []) as unknown as PendingPaymentRow[];

  const timeline = bookingRows.map((booking) => {
    const customer = one(booking.customers);
    const court = one(booking.courts);
    const openPlayCourt = one(booking.open_play_session_courts ?? null);
    const openPlay = one(openPlayCourt?.open_play_sessions ?? null);
    const sundayUnli = one(booking.sunday_unli_sessions ?? null);

    return {
      id: booking.id,
      reference: booking.reference,
      courtId: booking.court_id,
      courtName: court?.name ?? "Court",
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      startMinute: Math.max(
        0,
        Math.round(
          (new Date(booking.starts_at).getTime() - bounds.start.getTime()) /
            60000,
        ),
      ),
      endMinute: Math.min(
        24 * 60,
        Math.round(
          (new Date(booking.ends_at).getTime() - bounds.start.getTime()) /
            60000,
        ),
      ),
      kind: booking.kind,
      status: booking.status,
      customerName: customer?.full_name ?? null,
      blockReason: booking.block_reason,
      openPlaySessionId: openPlay?.id ?? null,
      openPlayReference: openPlay?.reference ?? null,
      openPlayTitle: openPlay?.title ?? null,
      openPlayPrice: openPlay ? Number(openPlay.price_per_player) : null,
      openPlayIsPublished: openPlay?.is_published ?? false,
      sundayUnliSessionId: sundayUnli?.id ?? null,
      sundayUnliReference: sundayUnli?.reference ?? null,
      sundayUnliPrice: sundayUnli
        ? Number(sundayUnli.price_per_player)
        : null,
      sundayUnliStatus: sundayUnli?.status ?? null,
      paymentStatus: one(booking.payments ?? null)?.status ?? null,
    } satisfies OwnerTimelineBooking;
  });

  const occupiedMinutes = timeline.reduce(
    (total, booking) =>
      total +
      Math.max(
        0,
        Math.min(booking.endMinute, settings.closing_hour * 60) -
          Math.max(booking.startMinute, settings.opening_hour * 60),
      ),
    0,
  );
  const availableMinutes =
    courts.length *
    (settings.closing_hour - settings.opening_hour) *
    60;

  // One batched request signs every receipt link in the queue.
  const signedReceipts =
    paymentRows.length > 0
      ? await supabase.storage
          .from("payment-receipts")
          .createSignedUrls(
            paymentRows.map((payment) => payment.receipt_path),
            5 * 60,
          )
      : { data: [], error: null };
  const signedUrlByPath = new Map(
    (signedReceipts.data ?? []).map((signed) => [
      signed.path,
      signed.error ? null : signed.signedUrl,
    ]),
  );

  const pendingPayments = paymentRows
    .map((payment) => {
      const parent = reviewParentFromRow(payment);

      if (!parent) return null;

      return {
        ...parent,
        id: payment.id,
        amount: payment.amount,
        gcashRef: payment.gcash_ref,
        createdAt: payment.created_at,
        receiptUrl: signedUrlByPath.get(payment.receipt_path) ?? null,
        isCourtBooking: Boolean(payment.booking_id),
      } satisfies OwnerPendingPayment;
    })
    .filter((payment): payment is OwnerPendingPayment => payment !== null);

  return {
    today,
    courts,
    openingHour: settings.opening_hour,
    closingHour: settings.closing_hour,
    timeline,
    metrics: {
      collected: Number(revenueResult.data ?? 0),
      bookingCount: bookingRows.filter((booking) =>
        ["regular", "recurring"].includes(booking.kind),
      ).length,
      pendingReceiptCount: paymentsResult.count ?? pendingPayments.length,
      occupancyPercent:
        availableMinutes > 0
          ? Math.round((occupiedMinutes / availableMinutes) * 100)
          : 0,
    },
    pendingPayments,
  };
}

export async function getOwnerCalendarData(
  weekStart: string,
  selectedDay: string,
) {
  await requireOwner();

  const supabase = await createClient();
  const weekBounds = manilaDayBounds(weekStart);
  const weekEnd = manilaDayBounds(addDaysToIsoDate(weekStart, 7));

  const [courtsResult, settingsResult, bookingsResult] = await Promise.all([
    supabase
      .from("courts")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("id"),
    supabase
      .from("business_settings")
      .select(
        "opening_hour, closing_hour, open_play_price_per_player, sunday_unli_price",
      )
      .eq("id", 1)
      .single(),
    supabase
      .from("bookings")
      .select(
        "id, reference, court_id, starts_at, ends_at, kind, status, total_amount, paddle_count, block_reason, customers(full_name, phone, email), courts(name), open_play_session_courts(open_play_sessions(id, reference, title, price_per_player, is_published)), sunday_unli_sessions(id, reference, price_per_player, status), payments(id, status)",
      )
      .gte("starts_at", earliestOverlappingStart(weekBounds.startIso))
      .lt("starts_at", weekEnd.startIso)
      .gt("ends_at", weekBounds.startIso)
      .not("status", "in", "(cancelled,no_show)")
      .order("starts_at"),
  ]);

  if (courtsResult.error || settingsResult.error || bookingsResult.error) {
    throw new Error("The owner calendar data could not be loaded.");
  }

  const courts = (courtsResult.data ?? []) as Array<{
    id: number;
    name: string;
    is_active: boolean;
  }>;
  const settings = settingsResult.data as {
    opening_hour: number;
    closing_hour: number;
    open_play_price_per_player: number;
    sunday_unli_price: number;
  };
  const bookingRows = (bookingsResult.data ?? []) as unknown as BookingRow[];
  const minutesAvailablePerDay =
    courts.length * (settings.closing_hour - settings.opening_hour) * 60;

  const days = getWeekDays(weekStart).map((date) => {
    const bounds = manilaDayBounds(date);
    const openingTime =
      bounds.start.getTime() + settings.opening_hour * 60 * 60 * 1000;
    const closingTime =
      bounds.start.getTime() + settings.closing_hour * 60 * 60 * 1000;
    const entries = bookingRows.filter((booking) => {
      const startsAt = new Date(booking.starts_at).getTime();
      const endsAt = new Date(booking.ends_at).getTime();

      return startsAt < bounds.end.getTime() && endsAt > bounds.start.getTime();
    });
    const occupiedMinutes = entries.reduce((total, booking) => {
      const startsAt = Math.max(
        new Date(booking.starts_at).getTime(),
        openingTime,
      );
      const endsAt = Math.min(new Date(booking.ends_at).getTime(), closingTime);

      return total + Math.max(0, Math.round((endsAt - startsAt) / 60000));
    }, 0);

    return {
      date,
      entryCount: entries.length,
      pendingCount: entries.filter(
        (booking) =>
          booking.status === "pending" &&
          ["regular", "recurring"].includes(booking.kind),
      ).length,
      blockedCount: entries.filter((booking) => booking.kind === "blocked")
        .length,
      hasOpenPlay: entries.some((booking) => booking.kind === "open_play"),
      hasSundayUnli: entries.some(
        (booking) => booking.kind === "sunday_unli",
      ),
      occupancyPercent:
        minutesAvailablePerDay > 0
          ? Math.round((occupiedMinutes / minutesAvailablePerDay) * 100)
          : 0,
    } satisfies OwnerCalendarDaySummary;
  });

  const selectedBounds = manilaDayBounds(selectedDay);
  const timeline = bookingRows
    .filter((booking) => {
      const startsAt = new Date(booking.starts_at).getTime();
      const endsAt = new Date(booking.ends_at).getTime();

      return (
        startsAt < selectedBounds.end.getTime() &&
        endsAt > selectedBounds.start.getTime()
      );
    })
    .map((booking) => {
      const customer = one(booking.customers);
      const court = one(booking.courts);
      const openPlayCourt = one(booking.open_play_session_courts ?? null);
      const openPlay = one(openPlayCourt?.open_play_sessions ?? null);
      const sundayUnli = one(booking.sunday_unli_sessions ?? null);

      return {
        id: booking.id,
        reference: booking.reference,
        courtId: booking.court_id,
        courtName: court?.name ?? "Court",
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        startMinute: Math.max(
          0,
          Math.round(
            (new Date(booking.starts_at).getTime() -
              selectedBounds.start.getTime()) /
              60000,
          ),
        ),
        endMinute: Math.min(
          24 * 60,
          Math.round(
            (new Date(booking.ends_at).getTime() -
              selectedBounds.start.getTime()) /
              60000,
          ),
        ),
        kind: booking.kind,
        status: booking.status,
        customerName: customer?.full_name ?? null,
        blockReason: booking.block_reason,
        openPlaySessionId: openPlay?.id ?? null,
        openPlayReference: openPlay?.reference ?? null,
        openPlayTitle: openPlay?.title ?? null,
        openPlayPrice: openPlay ? Number(openPlay.price_per_player) : null,
        openPlayIsPublished: openPlay?.is_published ?? false,
        sundayUnliSessionId: sundayUnli?.id ?? null,
        sundayUnliReference: sundayUnli?.reference ?? null,
        sundayUnliPrice: sundayUnli
          ? Number(sundayUnli.price_per_player)
          : null,
        sundayUnliStatus: sundayUnli?.status ?? null,
        paymentStatus: one(booking.payments ?? null)?.status ?? null,
      } satisfies OwnerTimelineBooking;
    });

  return {
    today: getTodayInManila(),
    nowIso: new Date().toISOString(),
    weekStart,
    selectedDay,
    courts,
    openingHour: settings.opening_hour,
    closingHour: settings.closing_hour,
    openPlayPricePerPlayer: settings.open_play_price_per_player,
    sundayUnliPricePerPlayer: settings.sunday_unli_price,
    days,
    timeline,
  };
}

export async function getCourtBlockPreview(
  selection: CourtBlockSelection,
): Promise<OwnerCourtBlockPreview> {
  await requireOwner();

  const supabase = await createClient();
  const startsAt = manilaHourToIso(selection.date, selection.startHour);
  const endsAt = manilaHourToIso(selection.date, selection.endHour);
  const [courtResult, settingsResult, conflictsResult] = await Promise.all([
    supabase
      .from("courts")
      .select("id, name")
      .in("id", selection.courtIds)
      .eq("is_active", true)
      .order("id"),
    supabase
      .from("business_settings")
      .select("opening_hour, closing_hour")
      .eq("id", 1)
      .single(),
    supabase
      .from("bookings")
      .select(
        "id, reference, court_id, starts_at, ends_at, kind, status, block_reason, courts(name), customers(full_name, phone, email), payments(status, amount)",
      )
      .in("court_id", selection.courtIds)
      .neq("status", "cancelled")
      .gte("starts_at", earliestOverlappingStart(startsAt))
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt)
      .order("court_id")
      .order("starts_at"),
  ]);

  if (courtResult.error || settingsResult.error || conflictsResult.error) {
    throw new Error("The court block preview could not be loaded.");
  }

  const base = {
    selection,
    courtNames: (courtResult.data ?? []).map((court) => court.name),
    startsAt,
    endsAt,
    emailConfigured: isCustomerEmailConfigured(),
    affectedBookings: [] as OwnerCourtBlockConflict[],
    specialConflicts: [] as OwnerCourtBlockSpecialConflict[],
  };

  if (courtResult.data.length !== selection.courtIds.length) {
    return { ...base, error: "Choose only active courts." };
  }

  if (
    selection.startHour < settingsResult.data.opening_hour ||
    selection.endHour > settingsResult.data.closing_hour
  ) {
    return {
      ...base,
      error: "The selected period is outside the court's operating hours.",
    };
  }

  if (new Date(startsAt).getTime() <= Date.now()) {
    return { ...base, error: "Choose a court block that starts in the future." };
  }

  type ConflictRow = {
    id: string;
    reference: string;
    starts_at: string;
    ends_at: string;
    kind: string;
    status: string;
    block_reason: string | null;
    courts: OneOrMany<{ name: string }>;
    customers: OneOrMany<CustomerRelation>;
    payments: OneOrMany<{ status: string; amount: number }>;
  };

  const conflicts = (conflictsResult.data ?? []) as unknown as ConflictRow[];
  const affectedBookings = conflicts
    .filter((booking) => ["regular", "recurring"].includes(booking.kind))
    .map((booking) => {
      const customer = one(booking.customers);
      const payment = one(booking.payments);
      const court = one(booking.courts);

      return {
        id: booking.id,
        reference: booking.reference,
        courtName: court?.name ?? "Court",
        customerName: customer?.full_name ?? "Customer",
        customerEmail: customer?.email ?? "Not available",
        customerPhone: customer?.phone ?? "Not available",
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        status: booking.status,
        paymentStatus: payment?.status ?? null,
        paymentAmount: Number(payment?.amount ?? 0),
        needsReschedule: Boolean(
          payment && ["verified", "unverified"].includes(payment.status),
        ),
      } satisfies OwnerCourtBlockConflict;
    });
  const specialConflicts = conflicts
    .filter((booking) => !["regular", "recurring"].includes(booking.kind))
    .map(
      (booking) =>
        ({
          id: booking.id,
          reference: booking.reference,
          courtName: one(booking.courts)?.name ?? "Court",
          kind: booking.kind,
          label:
            booking.kind === "blocked"
              ? booking.block_reason || "Existing court block"
              : booking.kind === "open_play"
                ? "Open play session"
                : "Sunday unli session",
          startsAt: booking.starts_at,
          endsAt: booking.ends_at,
        }) satisfies OwnerCourtBlockSpecialConflict,
    );

  return {
    ...base,
    error: null,
    affectedBookings,
    specialConflicts,
  };
}
