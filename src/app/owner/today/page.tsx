import type { Metadata } from "next";

import { MetricCard } from "@/components/owner/metric-card";
import { PendingPayments } from "@/components/owner/pending-payments";
import { TodayTimeline } from "@/components/owner/today-timeline";
import { UpcomingBookings } from "@/components/owner/upcoming-bookings";
import { getOwnerTodayData } from "@/lib/data/owner";
import { formatPeso } from "@/lib/money";

export const metadata: Metadata = {
  title: "Today",
};

type OwnerTodayPageProps = {
  searchParams: Promise<{
    reviewed?: string | string[];
    error?: string | string[];
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export default async function OwnerTodayPage({
  searchParams,
}: OwnerTodayPageProps) {
  const [data, params] = await Promise.all([
    getOwnerTodayData(),
    searchParams,
  ]);
  const reviewed = Array.isArray(params.reviewed)
    ? params.reviewed[0]
    : params.reviewed;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-court-700">
            {dateFormatter.format(new Date(`${data.today}T12:00:00Z`))}
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold text-ink-900 sm:text-5xl">
            Today
          </h1>
        </div>
        <p className="max-w-md text-sm leading-6 text-ink-500">
          Court activity, collected revenue, and receipts waiting for Tiffany&apos;s review.
        </p>
      </div>

      {reviewed ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Payment {reviewed}. The dashboard has been refreshed.
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          The payment review could not be saved. Confirm the Phase 3 migration is applied, then try again.
        </div>
      ) : null}

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Today's metrics">
        <MetricCard
          label="Collected today"
          value={formatPeso(data.metrics.collected)}
          detail="Verified payments only"
          accent
        />
        <MetricCard
          label="Court bookings"
          value={String(data.metrics.bookingCount)}
          detail="Pending and confirmed today"
        />
        <MetricCard
          label="Pending receipts"
          value={String(data.metrics.pendingReceiptCount)}
          detail="Across all upcoming reservations"
        />
        <MetricCard
          label="Court occupancy"
          value={`${data.metrics.occupancyPercent}%`}
          detail="Booked or blocked court-hours"
        />
      </section>

      <div className="mt-7">
        <TodayTimeline
          courts={data.courts}
          bookings={data.timeline}
          openingHour={data.openingHour}
          closingHour={data.closingHour}
        />
      </div>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,.8fr)] xl:items-start">
        <PendingPayments
          payments={data.pendingPayments}
          total={data.metrics.pendingReceiptCount}
        />
        <UpcomingBookings bookings={data.upcoming} />
      </div>
    </div>
  );
}
