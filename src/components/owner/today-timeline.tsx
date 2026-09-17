import { manilaTimeFormatter } from "@/lib/dates";
import type { OwnerTimelineBooking } from "@/lib/data/owner";

type TodayTimelineProps = {
  courts: Array<{ id: number; name: string }>;
  bookings: OwnerTimelineBooking[];
  openingHour: number;
  closingHour: number;
};

function hourLabel(hour: number) {
  if (hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  return `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? "PM" : "AM"}`;
}

function bookingLabel(booking: OwnerTimelineBooking) {
  if (booking.kind === "blocked") return booking.blockReason ?? "Court blocked";
  if (booking.kind === "open_play") return booking.openPlayTitle ?? "Open play";
  if (booking.kind === "sunday_unli") return "Sunday unli";
  return booking.customerName ?? booking.reference;
}

function eventClass(booking: OwnerTimelineBooking) {
  if (booking.kind === "blocked") return "border-slate-300 bg-slate-100 text-slate-800";
  if (booking.kind === "open_play") return "border-sky-300 bg-sky-50 text-sky-900";
  if (booking.kind === "sunday_unli") return "border-violet-300 bg-violet-50 text-violet-900";
  if (booking.status === "pending") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-emerald-300 bg-emerald-50 text-emerald-950";
}

export function TodayTimeline({
  courts,
  bookings,
  openingHour,
  closingHour,
}: TodayTimelineProps) {
  const durationHours = closingHour - openingHour;
  const height = durationHours * 48;
  const hourMarks = Array.from(
    { length: durationHours + 1 },
    (_, index) => openingHour + index,
  );

  return (
    <section className="rounded-2xl border border-court-800/10 bg-white">
      <div className="flex flex-col gap-2 border-b border-court-800/10 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-court-700">
            Live schedule
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink-900">
            Today across all courts
          </h2>
        </div>
        <p className="text-sm text-ink-500">
          Pending payments are amber; confirmed bookings are green.
        </p>
      </div>

      <div className="overflow-x-auto p-4 sm:p-5">
        <div className="grid min-w-[720px] grid-cols-[72px_repeat(3,minmax(190px,1fr))]">
          <div />
          {courts.map((court) => (
            <div
              key={court.id}
              className="border-b border-l border-court-800/10 px-3 pb-3 text-center font-display font-bold text-ink-900"
            >
              {court.name}
            </div>
          ))}

          <div className="relative" style={{ height }} aria-hidden="true">
            {hourMarks.map((hour, index) => (
              <span
                key={hour}
                className="absolute right-3 -translate-y-1/2 font-mono text-[10px] text-ink-500"
                style={{ top: index * 48 }}
              >
                {hourLabel(hour)}
              </span>
            ))}
          </div>

          {courts.map((court) => (
            <div
              key={court.id}
              className="relative border-l border-court-800/10 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_47px,rgba(11,79,42,.10)_47px,rgba(11,79,42,.10)_48px)]"
              style={{ height }}
            >
              {bookings
                .filter((booking) => booking.courtId === court.id)
                .map((booking) => {
                  const top =
                    ((booking.startMinute - openingHour * 60) / 60) * 48;
                  const eventHeight = Math.max(
                    ((booking.endMinute - booking.startMinute) / 60) * 48,
                    42,
                  );

                  return (
                    <article
                      key={booking.id}
                      className={`absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1.5 shadow-sm ${eventClass(booking)}`}
                      style={{ top, height: eventHeight - 4 }}
                      title={`${booking.reference} · ${bookingLabel(booking)}`}
                    >
                      <p className="truncate text-xs font-bold">
                        {bookingLabel(booking)}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[9px] opacity-75">
                        {manilaTimeFormatter.format(new Date(booking.startsAt))}–
                        {manilaTimeFormatter.format(new Date(booking.endsAt))}
                      </p>
                    </article>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
