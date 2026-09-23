import Link from "next/link";

import type {
  MyBookingDisplayStatus,
  MyBookingItem,
  MyBookingKind,
} from "@/lib/data/my-bookings";
import {
  manilaScheduleFormatter,
  manilaTimeFormatter,
} from "@/lib/dates";
import { formatPeso } from "@/lib/money";

const kindLabels: Record<MyBookingKind, string> = {
  court_booking: "Court booking",
  open_play: "Open Play",
  sunday_unli: "Sunday Unli",
};

const statusDetails: Record<
  MyBookingDisplayStatus,
  { label: string; description: string; className: string }
> = {
  awaiting_payment: {
    label: "Awaiting payment",
    description: "Complete your GCash payment proof before the hold expires.",
    className: "bg-amber-100 text-amber-900",
  },
  pending_verification: {
    label: "Pending verification",
    description: "Your receipt was received and is waiting for Tiffany’s review.",
    className: "bg-amber-100 text-amber-900",
  },
  confirmed: {
    label: "Confirmed",
    description: "Your payment is verified and your place is confirmed.",
    className: "bg-emerald-100 text-emerald-800",
  },
  cancelled: {
    label: "Cancelled",
    description: "This reservation is cancelled and is no longer active.",
    className: "bg-red-100 text-red-800",
  },
  refund_pending: {
    label: "Refund pending",
    description: "Tiffany is preparing the return of your verified payment.",
    className: "bg-orange-100 text-orange-900",
  },
  refunded: {
    label: "Refunded",
    description: "Tiffany marked the GCash refund as completed.",
    className: "bg-sky-100 text-sky-800",
  },
  expired: {
    label: "Hold expired",
    description: "No receipt was submitted before the payment hold ended.",
    className: "bg-stone-200 text-stone-700",
  },
  no_show: {
    label: "No show",
    description: "This reservation was recorded as a no-show.",
    className: "bg-stone-200 text-stone-700",
  },
};

export function MyBookingCard({ item }: { item: MyBookingItem }) {
  const status = statusDetails[item.displayStatus];

  return (
    <article className="rounded-2xl border border-court-800/10 bg-white p-5 shadow-[0_8px_30px_rgba(7,52,28,.05)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-court-800/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-court-800">
              {kindLabels[item.kind]}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <h3 className="mt-3 font-display text-2xl font-bold text-ink-900">
            {item.title}
          </h3>
          <p className="mt-1 font-mono text-xs font-semibold text-ink-500">
            {item.reference}
          </p>
        </div>
        <p className="shrink-0 font-display text-2xl font-bold text-ink-900">
          {formatPeso(item.amount)}
        </p>
      </div>

      <dl className="mt-5 grid gap-4 border-y border-court-800/10 py-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <dt className="text-ink-500">Schedule</dt>
          <dd className="mt-1 font-semibold leading-6 text-ink-900">
            {manilaScheduleFormatter.format(new Date(item.startsAt))}–
            {manilaTimeFormatter.format(new Date(item.endsAt))}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">
            {item.courtNames.length === 1 ? "Court" : "Courts"}
          </dt>
          <dd className="mt-1 font-semibold text-ink-900">
            {item.courtNames.join(", ") || "Court assignment pending"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">
            {item.gcashReference ? "GCash reference" : "Payment"}
          </dt>
          <dd className="mt-1 break-all font-mono font-semibold text-ink-900">
            {item.gcashReference ?? "No receipt submitted"}
          </dd>
        </div>
        {item.paddleCount !== null ? (
          <div>
            <dt className="text-ink-500">Paddle rentals</dt>
            <dd className="mt-1 font-semibold text-ink-900">
              {item.paddleCount}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm leading-6 text-ink-500">
          {status.description}
        </p>
        {item.actionHref && item.actionLabel ? (
          <Link
            href={item.actionHref}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-court-800 px-4 text-sm font-bold text-white transition hover:bg-court-700"
          >
            {item.actionLabel}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
