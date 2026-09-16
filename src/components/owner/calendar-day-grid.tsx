import { manilaTimeFormatter } from "@/lib/dates";
import type { OwnerTimelineBooking } from "@/lib/data/owner";

type CalendarDayGridProps = {
  selectedDay: string;
  courts: Array<{ id: number; name: string }>;
  bookings: OwnerTimelineBooking[];
  openingHour: number;
  closingHour: number;
};

const ROW_HEIGHT = 56;

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

function hourLabel(hour: number) {
  if (hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";

  return `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? "PM" : "AM"}`;
}

function bookingLabel(booking: OwnerTimelineBooking) {
  if (booking.kind === "blocked") {
    return booking.blockReason ?? "Court blocked";
  }

  if (booking.kind === "open_play") return "Open play";
  if (booking.kind === "sunday_unli") return "Sunday unli";

  return booking.customerName ?? booking.reference;
}

function eventClass(booking: OwnerTimelineBooking) {
  if (booking.kind === "blocked") {
    return "border-slate-300 bg-slate-100 text-slate-900";
  }

  if (booking.kind === "open_play") {
    return "border-sky-300 bg-sky-50 text-sky-950";
  }

  if (booking.kind === "sunday_unli") {
    return "border-violet-300 bg-violet-50 text-violet-950";
  }

  if (booking.status === "pending") {
    return "border-amber-300 bg-amber-50 text-amber-950";
  }

  return "border-emerald-300 bg-emerald-50 text-emerald-950";
}

export function CalendarDayGrid({
  selectedDay,
  courts,
  bookings,
  openingHour,
  closingHour,
}: CalendarDayGridProps) {
  const durationHours = closingHour - openingHour;
  const gridHeight = durationHours * ROW_HEIGHT;
  const hourMarks = Array.from(
    { length: durationHours + 1 },
    (_, index) => openingHour + index,
  );

  return (
    <section className="rounded-2xl border border-court-800/10 bg-white">
      <div className="flex flex-col gap-4 border-b border-court-800/10 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-court-700">
            Day schedule
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink-900">
            {dateFormatter.format(new Date(`${selectedDay}T12:00:00Z`))}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {bookings.length === 0
              ? "No scheduled activity for this day."
              : `${bookings.length} scheduled ${bookings.length === 1 ? "block" : "blocks"} across ${courts.length} courts.`}
          </p>
        </div>

        <div
          className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold uppercase tracking-wide text-ink-500"
          aria-label="Schedule color legend"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-400" /> Confirmed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-400" /> Pending
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-sky-400" /> Open play
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-violet-400" /> Sunday unli
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-slate-400" /> Blocked
          </span>
        </div>
      </div>

      <div className="overflow-x-auto p-4 sm:p-5">
        <div
          className="grid min-w-[760px]"
          style={{
            gridTemplateColumns: `76px repeat(${courts.length}, minmax(210px, 1fr))`,
          }}
        >
          <div />
          {courts.map((court) => (
            <div
              key={court.id}
              className="border-b border-l border-court-800/10 px-3 pb-3 text-center font-display text-lg font-bold text-ink-900"
            >
              {court.name}
            </div>
          ))}

          <div className="relative" style={{ height: gridHeight }} aria-hidden="true">
            {hourMarks.map((hour, index) => (
              <span
                key={hour}
                className="absolute right-3 -translate-y-1/2 font-mono text-[10px] text-ink-500"
                style={{ top: index * ROW_HEIGHT }}
              >
                {hourLabel(hour)}
              </span>
            ))}
          </div>

          {courts.map((court) => (
            <div
              key={court.id}
              className="relative border-l border-court-800/10 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_55px,rgba(11,79,42,.10)_55px,rgba(11,79,42,.10)_56px)]"
              style={{ height: gridHeight }}
              aria-label={`${court.name} schedule`}
            >
              {bookings
                .filter((booking) => booking.courtId === court.id)
                .map((booking) => {
                  const displayStart = Math.max(
                    booking.startMinute,
                    openingHour * 60,
                  );
                  const displayEnd = Math.min(
                    booking.endMinute,
                    closingHour * 60,
                  );

                  if (displayEnd <= displayStart) return null;

                  const top =
                    ((displayStart - openingHour * 60) / 60) * ROW_HEIGHT;
                  const height = Math.max(
                    ((displayEnd - displayStart) / 60) * ROW_HEIGHT - 4,
                    44,
                  );
                  const label = bookingLabel(booking);
                  const time = `${manilaTimeFormatter.format(new Date(booking.startsAt))} - ${manilaTimeFormatter.format(new Date(booking.endsAt))}`;

                  return (
                    <article
                      key={booking.id}
                      className={`absolute inset-x-1 overflow-hidden rounded-lg border px-2.5 py-1.5 shadow-sm ${eventClass(booking)}`}
                      style={{ top, height }}
                      title={`${booking.reference} - ${label} - ${booking.status}`}
                      aria-label={`${label}, ${time}, ${booking.status}`}
                    >
                      <p className="truncate text-xs font-bold">{label}</p>
                      <p className="mt-0.5 truncate font-mono text-[9px] opacity-75">
                        {time}
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
