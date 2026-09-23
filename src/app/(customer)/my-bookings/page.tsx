import type { Metadata } from "next";
import Link from "next/link";

import { MyBookingCard } from "@/components/booking/my-booking-card";
import { SiteNav } from "@/components/shared/site-nav";
import {
  getMyBookingsData,
  type MyBookingItem,
} from "@/lib/data/my-bookings";

export const metadata: Metadata = {
  title: "My bookings",
};

const historyStatuses = new Set([
  "cancelled",
  "refund_pending",
  "refunded",
  "expired",
  "no_show",
]);

function isHistory(item: MyBookingItem, now: number) {
  return (
    new Date(item.endsAt).valueOf() <= now ||
    historyStatuses.has(item.displayStatus)
  );
}

function BookingSection({
  title,
  description,
  items,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: MyBookingItem[];
  emptyMessage: string;
}) {
  return (
    <section>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-court-700">
            {items.length} {items.length === 1 ? "reservation" : "reservations"}
          </p>
          <h2 className="mt-1 font-display text-3xl font-bold text-ink-900">
            {title}
          </h2>
        </div>
        <p className="max-w-lg text-sm leading-6 text-ink-500">
          {description}
        </p>
      </div>

      {items.length > 0 ? (
        <div className="mt-5 grid gap-4">
          {items.map((item) => (
            <MyBookingCard key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-court-800/20 bg-white/60 px-5 py-10 text-center text-sm text-ink-500">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

export default async function MyBookingsPage() {
  const data = await getMyBookingsData();

  return (
    <main className="min-h-screen bg-cream-50">
      <header className="border-b border-white/10 bg-court-950 text-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="Tiffany's Pickleball Court home"
          >
            <span
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-full border border-gold-200/40 bg-court-800 font-mono text-xs font-semibold text-gold-200"
            >
              TP
            </span>
            <span>
              <span className="block font-display text-base font-bold leading-none tracking-wide text-gold-200 sm:text-lg">
                TIFFANY&apos;S
              </span>
              <span className="mt-1 block text-[9px] font-semibold tracking-[0.18em] text-white/55">
                PICKLEBALL COURT
              </span>
            </span>
          </Link>
          <SiteNav />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        {!data.ok ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h1 className="font-display text-3xl font-bold text-red-900">
              My bookings are unavailable
            </h1>
            <p className="mt-2 text-sm leading-6 text-red-800">{data.error}</p>
          </section>
        ) : data.profileMissing ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h1 className="font-display text-3xl font-bold text-red-900">
              Customer profile incomplete
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-red-800">
              This account does not have the customer profile required to view reservations. Sign out and create the customer account again with your full name and Philippine mobile number.
            </p>
          </section>
        ) : (
          <MyBookingsContent
            customerName={data.customerName}
            items={data.items}
            evaluatedAt={data.evaluatedAt}
          />
        )}
      </div>
    </main>
  );
}

function MyBookingsContent({
  customerName,
  items,
  evaluatedAt,
}: {
  customerName: string;
  items: MyBookingItem[];
  evaluatedAt: number;
}) {
  const upcoming = items
    .filter((item) => !isHistory(item, evaluatedAt))
    .toSorted(
      (left, right) =>
        new Date(left.startsAt).valueOf() - new Date(right.startsAt).valueOf(),
    );
  const history = items
    .filter((item) => isHistory(item, evaluatedAt))
    .toSorted(
      (left, right) =>
        new Date(right.startsAt).valueOf() - new Date(left.startsAt).valueOf(),
    );
  const confirmedCount = upcoming.filter(
    (item) => item.displayStatus === "confirmed",
  ).length;
  const needsAttentionCount = upcoming.filter((item) =>
    ["awaiting_payment", "pending_verification"].includes(item.displayStatus),
  ).length;

  return (
    <>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-court-700">
            Customer reservations
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold text-ink-900 sm:text-5xl">
            My bookings
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-500">
            Welcome back, {customerName}. Track your court bookings, Open Play registrations, Sunday Unli sessions, and payment status here.
          </p>
        </div>
        <Link
          href="/#availability"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-court-800 px-5 font-bold text-white transition hover:bg-court-700"
        >
          Make another booking
        </Link>
      </div>

      <section
        className="mt-7 grid gap-4 sm:grid-cols-3"
        aria-label="Booking summary"
      >
        <article className="rounded-2xl border border-court-800 bg-court-800 p-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold-200">
            Upcoming
          </p>
          <p className="mt-3 font-display text-4xl font-bold leading-none">
            {upcoming.length}
          </p>
          <p className="mt-2 text-sm text-white/65">Active reservations</p>
        </article>
        <article className="rounded-2xl border border-court-800/10 bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-500">
            Confirmed
          </p>
          <p className="mt-3 font-display text-4xl font-bold leading-none text-ink-900">
            {confirmedCount}
          </p>
          <p className="mt-2 text-sm text-ink-500">Payment verified</p>
        </article>
        <article className="rounded-2xl border border-court-800/10 bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-500">
            Needs attention
          </p>
          <p className="mt-3 font-display text-4xl font-bold leading-none text-ink-900">
            {needsAttentionCount}
          </p>
          <p className="mt-2 text-sm text-ink-500">Payment or verification</p>
        </article>
      </section>

      <div className="mt-10 space-y-12">
        <BookingSection
          title="Upcoming and active"
          description="Future reservations that are awaiting payment, under review, or confirmed."
          items={upcoming}
          emptyMessage="You do not have an upcoming reservation yet."
        />
        <BookingSection
          title="Past and history"
          description="Completed, expired, cancelled, and refunded reservation records."
          items={history}
          emptyMessage="Past reservations will appear here."
        />
      </div>
    </>
  );
}
