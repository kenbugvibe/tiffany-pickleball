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
  open_play_sessions?: OneOrMany<OpenPlayRelation>;
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
};

export type OwnerPendingPayment = ReviewParent & {
  id: string;
  amount: number;
  gcashRef: string;
  createdAt: string;
  receiptUrl: string | null;
};

export type OwnerUpcomingBooking = {
  id: string;
  reference: string;
  courtName: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
  status: string;
  amount: number;
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
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  startsAt: string;
  endsAt: string;
  status: string;
  paymentStatus: string | null;
  paymentAmount: number;
  refundAmount: number;
};

export type OwnerCourtBlockSpecialConflict = {
  id: string;
  reference: string;
  kind: string;
  label: string;
  startsAt: string;
  endsAt: string;
};

export type OwnerCourtBlockPreview = {
  selection: CourtBlockSelection;
  courtName: string | null;
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

async function getReviewParent(
  payment: PaymentRow,
): Promise<ReviewParent | null> {
  const supabase = await createClient();

  if (payment.booking_id) {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "reference, starts_at, ends_at, customer_note, courts(name), customers(full_name, phone, email)",
      )
      .eq("id", payment.booking_id)
      .maybeSingle();

    if (error || !data) return null;

    const customer = one(data.customers as OneOrMany<CustomerRelation>);
    const court = one(data.courts as OneOrMany<CourtRelation>);

    return {
      reference: data.reference,
      customerName: customer?.full_name ?? "Customer",
      customerPhone: customer?.phone ?? "Not available",
      customerEmail: customer?.email ?? "Not available",
      courtName: court?.name ?? "Court",
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      note: data.customer_note,
      typeLabel: "Court booking",
    };
  }

  if (payment.open_play_signup_id) {
    const { data, error } = await supabase
      .from("open_play_signups")
      .select(
        "reference, customers(full_name, phone, email), open_play_sessions(title, bookings(starts_at, ends_at, courts(name)))",
      )
      .eq("id", payment.open_play_signup_id)
      .maybeSingle();

    if (error || !data) return null;

    const customer = one(data.customers as OneOrMany<CustomerRelation>);
    const session = one(
      data.open_play_sessions as OneOrMany<{
        title: string;
        bookings: OneOrMany<{
          starts_at: string;
          ends_at: string;
          courts: OneOrMany<CourtRelation>;
        }>;
      }>,
    );
    const booking = one(session?.bookings ?? null);
    const court = one(booking?.courts ?? null);

    if (!booking) return null;

    return {
      reference: data.reference,
      customerName: customer?.full_name ?? "Customer",
      customerPhone: customer?.phone ?? "Not available",
      customerEmail: customer?.email ?? "Not available",
      courtName: court?.name ?? "Court",
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      note: null,
      typeLabel: session?.title ?? "Open play",
    };
  }

  if (payment.sunday_unli_signup_id) {
    const { data, error } = await supabase
      .from("sunday_unli_signups")
      .select(
        "reference, customers(full_name, phone, email), sunday_unli_sessions(starts_at, ends_at)",
      )
      .eq("id", payment.sunday_unli_signup_id)
      .maybeSingle();

    if (error || !data) return null;

    const customer = one(data.customers as OneOrMany<CustomerRelation>);
    const session = one(
      data.sunday_unli_sessions as OneOrMany<{
        starts_at: string;
        ends_at: string;
      }>,
    );

    if (!session) return null;

    return {
      reference: data.reference,
      customerName: customer?.full_name ?? "Customer",
      customerPhone: customer?.phone ?? "Not available",
      customerEmail: customer?.email ?? "Not available",
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
  const nowIso = new Date().toISOString();

  const [
    courtsResult,
    settingsResult,
    bookingsResult,
    revenueResult,
    paymentsResult,
    upcomingResult,
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
        "id, reference, court_id, starts_at, ends_at, kind, status, total_amount, paddle_count, block_reason, customers(full_name, phone, email), courts(name), open_play_sessions(id, reference, title, price_per_player, is_published)",
      )
      .lt("starts_at", bounds.endIso)
      .gt("ends_at", bounds.startIso)
      .not("status", "in", "(cancelled,no_show)")
      .order("starts_at"),
    supabase.from("revenue_daily").select("collected").eq("day", today).maybeSingle(),
    supabase
      .from("payments")
      .select(
        "id, booking_id, open_play_signup_id, sunday_unli_signup_id, amount, gcash_ref, receipt_path, created_at",
        { count: "exact" },
      )
      .eq("status", "unverified")
      .order("created_at")
      .limit(6),
    supabase
      .from("bookings")
      .select(
        "id, reference, starts_at, ends_at, status, total_amount, customers(full_name, phone, email), courts(name)",
      )
      .in("kind", ["regular", "recurring"])
      .not("status", "in", "(cancelled,no_show)")
      .gte("starts_at", nowIso)
      .order("starts_at")
      .limit(5),
  ]);

  const requiredResults = [
    courtsResult,
    settingsResult,
    bookingsResult,
    revenueResult,
    paymentsResult,
    upcomingResult,
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
  const paymentRows = (paymentsResult.data ?? []) as PaymentRow[];
  const upcomingRows = (upcomingResult.data ?? []) as unknown as BookingRow[];

  const timeline = bookingRows.map((booking) => {
    const customer = one(booking.customers);
    const court = one(booking.courts);
    const openPlay = one(booking.open_play_sessions ?? null);

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

  const pendingPayments = (
    await Promise.all(
      paymentRows.map(async (payment) => {
        const [parent, signedReceipt] = await Promise.all([
          getReviewParent(payment),
          supabase.storage
            .from("payment-receipts")
            .createSignedUrl(payment.receipt_path, 5 * 60),
        ]);

        if (!parent) return null;

        return {
          ...parent,
          id: payment.id,
          amount: payment.amount,
          gcashRef: payment.gcash_ref,
          createdAt: payment.created_at,
          receiptUrl: signedReceipt.data?.signedUrl ?? null,
        } satisfies OwnerPendingPayment;
      }),
    )
  ).filter((payment): payment is OwnerPendingPayment => payment !== null);

  const upcoming = upcomingRows.map((booking) => {
    const customer = one(booking.customers);
    const court = one(booking.courts);

    return {
      id: booking.id,
      reference: booking.reference,
      courtName: court?.name ?? "Court",
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      customerName: customer?.full_name ?? "Customer",
      status: booking.status,
      amount: booking.total_amount,
    } satisfies OwnerUpcomingBooking;
  });

  return {
    today,
    courts,
    openingHour: settings.opening_hour,
    closingHour: settings.closing_hour,
    timeline,
    metrics: {
      collected: Number(revenueResult.data?.collected ?? 0),
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
    upcoming,
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
      .select("opening_hour, closing_hour, open_play_price_per_player")
      .eq("id", 1)
      .single(),
    supabase
      .from("bookings")
      .select(
        "id, reference, court_id, starts_at, ends_at, kind, status, total_amount, paddle_count, block_reason, customers(full_name, phone, email), courts(name), open_play_sessions(id, reference, title, price_per_player, is_published)",
      )
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
      const openPlay = one(booking.open_play_sessions ?? null);

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
      .eq("id", selection.courtId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("business_settings")
      .select("opening_hour, closing_hour")
      .eq("id", 1)
      .single(),
    supabase
      .from("bookings")
      .select(
        "id, reference, starts_at, ends_at, kind, status, block_reason, customers(full_name, phone, email), payments(status, amount)",
      )
      .eq("court_id", selection.courtId)
      .neq("status", "cancelled")
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt)
      .order("starts_at"),
  ]);

  if (courtResult.error || settingsResult.error || conflictsResult.error) {
    throw new Error("The court block preview could not be loaded.");
  }

  const base = {
    selection,
    courtName: courtResult.data?.name ?? null,
    startsAt,
    endsAt,
    emailConfigured: isCustomerEmailConfigured(),
    affectedBookings: [] as OwnerCourtBlockConflict[],
    specialConflicts: [] as OwnerCourtBlockSpecialConflict[],
  };

  if (!courtResult.data) {
    return { ...base, error: "Choose an active court." };
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
    customers: OneOrMany<CustomerRelation>;
    payments: OneOrMany<{ status: string; amount: number }>;
  };

  const conflicts = (conflictsResult.data ?? []) as unknown as ConflictRow[];
  const affectedBookings = conflicts
    .filter((booking) => ["regular", "recurring"].includes(booking.kind))
    .map((booking) => {
      const customer = one(booking.customers);
      const payment = one(booking.payments);

      return {
        id: booking.id,
        reference: booking.reference,
        customerName: customer?.full_name ?? "Customer",
        customerEmail: customer?.email ?? "Not available",
        customerPhone: customer?.phone ?? "Not available",
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        status: booking.status,
        paymentStatus: payment?.status ?? null,
        paymentAmount: Number(payment?.amount ?? 0),
        refundAmount:
          payment && ["verified", "refund_pending"].includes(payment.status)
            ? Number(payment.amount)
            : 0,
      } satisfies OwnerCourtBlockConflict;
    });
  const specialConflicts = conflicts
    .filter((booking) => !["regular", "recurring"].includes(booking.kind))
    .map(
      (booking) =>
        ({
          id: booking.id,
          reference: booking.reference,
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
