import { createOpenPlaySessionAction } from "@/actions/owner";
import { CourtMultiSelector } from "@/components/owner/court-multi-selector";
import { formatPeso } from "@/lib/money";

type OpenPlayPanelProps = {
  courts: Array<{ id: number; name: string }>;
  today: string;
  selectedDay: string;
  openingHour: number;
  closingHour: number;
  pricePerPlayer: number;
};

function hourLabel(hour: number) {
  if (hour === 24) return "12:00 AM";
  if (hour === 12) return "12:00 PM";

  return `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}`;
}

export function OpenPlayPanel({
  courts,
  today,
  selectedDay,
  openingHour,
  closingHour,
  pricePerPlayer,
}: OpenPlayPanelProps) {
  const startHours = Array.from(
    { length: closingHour - openingHour },
    (_, index) => openingHour + index,
  );
  const endHours = Array.from(
    { length: closingHour - openingHour },
    (_, index) => openingHour + index + 1,
  );

  return (
    <section className="rounded-2xl border border-sky-200 bg-white">
      <div className="border-b border-sky-100 px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">
          Player events
        </p>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-900">
              Publish open play
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">
              Reserve one or more courts for a public session. Customers will
              see the event in availability at the configured entry price.
            </p>
          </div>
          <span className="w-fit rounded-full bg-sky-100 px-3 py-1.5 text-xs font-bold text-sky-900">
            {formatPeso(pricePerPlayer)} per person
          </span>
        </div>
      </div>

      <form
        action={createOpenPlaySessionAction}
        className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4"
      >
        <CourtMultiSelector
          courts={courts}
          inputName="courtId"
          idPrefix="open-play-court"
          description="Choose one court, any two courts, or all three for the same event."
          emptySelectionMessage="Select at least one court before publishing."
          tone="sky"
        />

        <label className="grid gap-1.5 text-sm font-bold text-ink-900">
          Date
          <input
            type="date"
            name="openPlayDate"
            min={today}
            defaultValue={selectedDay >= today ? selectedDay : today}
            required
            className="min-h-11 rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-sky-600"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-ink-900">
          Starts
          <select
            name="startHour"
            defaultValue={String(openingHour)}
            required
            className="min-h-11 rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-sky-600"
          >
            {startHours.map((hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-ink-900">
          Ends
          <select
            name="endHour"
            defaultValue={String(openingHour + 1)}
            required
            className="min-h-11 rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-sky-600"
          >
            {endHours.map((hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-ink-900">
          Event title
          <input
            type="text"
            name="title"
            minLength={3}
            maxLength={80}
            defaultValue="Open play"
            required
            className="min-h-11 rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-sky-600"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-ink-900 md:col-span-2 xl:col-span-4">
          Customer note <span className="font-normal text-ink-500">(optional)</span>
          <textarea
            name="customerNote"
            maxLength={500}
            rows={3}
            placeholder="Example: Beginner-friendly session. Bring water and arrive 10 minutes early."
            className="rounded-xl border border-court-800/20 bg-white px-3 py-2.5 font-normal outline-none placeholder:text-ink-500/60 focus:border-sky-600"
          />
        </label>

        <div className="md:col-span-2 xl:col-span-4">
          <button
            type="submit"
            disabled={courts.length === 0}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-sky-700 px-5 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            Publish open play
          </button>
          <p className="mt-2 text-xs leading-5 text-ink-500">
            Publishing fails safely if any selected court is already booked,
            blocked, or assigned to another event.
          </p>
        </div>
      </form>
    </section>
  );
}
