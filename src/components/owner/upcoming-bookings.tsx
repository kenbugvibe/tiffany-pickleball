import type { OwnerUpcomingBooking } from "@/lib/data/owner";
import { manilaScheduleFormatter } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

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
              <p className="mt-1 text-sm font-bold text-ink-900">
                {formatPeso(booking.amount)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
