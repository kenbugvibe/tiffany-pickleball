import Link from "next/link";

import type { OwnerUpcomingBooking } from "@/lib/data/owner";
import { manilaScheduleFormatter, toManilaIsoDate } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

function calendarDayHref(startsAt: string) {
  const day = toManilaIsoDate(new Date(startsAt));

  return `/owner/calendar?week=${day}&day=${day}`;
}

export function UpcomingBookings({
  bookings,
}: {
  bookings: OwnerUpcomingBooking[];
}) {
  return (
    <section className="rounded-2xl border border-court-800/10 bg-white">
      <div className="border-b border-court-800/10 px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-court-700">
          Next up
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold text-ink-900">
          Upcoming bookings
        </h2>
      </div>

      {bookings.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-500">
          No upcoming customer bookings.
        </p>
      ) : (
        <div className="divide-y divide-court-800/10">
          {bookings.map((booking) => (
            <article key={booking.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-ink-900">{booking.customerName}</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {booking.courtName} · {booking.reference}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                    booking.status === "confirmed"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {booking.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-ink-500">
                {manilaScheduleFormatter.format(new Date(booking.startsAt))}
              </p>
              {booking.status === "pending" ? (
                booking.paymentStatus === "unverified" && booking.paymentId ? (
                  <a
                    href={`#payment-${booking.paymentId}`}
                    className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-amber-100 px-3 text-xs font-bold text-amber-900 transition hover:bg-amber-200"
                  >
                    Receipt uploaded · Review now
                  </a>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-ink-500">
                    {booking.paymentStatus === "rejected"
                      ? "Receipt rejected"
                      : "Waiting for the customer's receipt"}
                  </p>
                )
              ) : null}
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-ink-900">
                  {formatPeso(booking.amount)}
                </p>
                <Link
                  href={calendarDayHref(booking.startsAt)}
                  className="text-xs font-bold text-court-700 underline-offset-2 hover:underline"
                >
                  Reschedule
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
