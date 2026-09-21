import { createSundayUnliSessionAction } from "@/actions/owner";
import { addDaysToIsoDate } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { getNextSunday, isSundayIsoDate } from "@/lib/sunday-unli";

type SundayUnliPanelProps = {
  today: string;
  selectedDay: string;
  courtNames: string[];
  pricePerPlayer: number;
};

const sundayDateFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

function formatSunday(date: string) {
  return sundayDateFormatter.format(new Date(`${date}T12:00:00Z`));
}

export function SundayUnliPanel({
  today,
  selectedDay,
  courtNames,
  pricePerPlayer,
}: SundayUnliPanelProps) {
  const firstSunday = getNextSunday(today);
  const upcomingSundays = Array.from({ length: 52 }, (_, index) =>
    addDaysToIsoDate(firstSunday, index * 7),
  );
  const selectedSunday =
    isSundayIsoDate(selectedDay) && selectedDay >= firstSunday
      ? selectedDay
      : firstSunday;

  if (!upcomingSundays.includes(selectedSunday)) {
    upcomingSundays.push(selectedSunday);
    upcomingSundays.sort();
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-white">
      <div className="border-b border-violet-100 px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">
          Sunday night special
        </p>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-900">
              Publish Sunday Unli
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">
              Reserve all three courts every Sunday from 7:00 PM until
              midnight. Each customer registers and pays individually.
            </p>
          </div>
          <span className="w-fit rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-900">
            {formatPeso(pricePerPlayer)} per person
          </span>
        </div>
      </div>

      <form
        action={createSundayUnliSessionAction}
        className="grid gap-4 p-5 md:grid-cols-2"
      >
        <label className="grid gap-1.5 text-sm font-bold text-ink-900">
          Sunday date
          <select
            name="sundayUnliDate"
            defaultValue={selectedSunday}
            required
            className="min-h-11 rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-violet-600"
          >
            {upcomingSundays.map((sunday) => (
              <option key={sunday} value={sunday}>
                {formatSunday(sunday)}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal leading-5 text-ink-500">
            Only upcoming Sundays can be selected.
          </span>
        </label>

        <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm">
          <p className="font-bold text-violet-950">Fixed session</p>
          <p className="mt-1 text-violet-900">7:00 PM–12:00 midnight</p>
          <p className="mt-1 text-xs leading-5 text-violet-800">
            {courtNames.join(", ") || "All three active courts"}
          </p>
        </div>

        <label className="grid gap-1.5 text-sm font-bold text-ink-900 md:col-span-2">
          Customer note <span className="font-normal text-ink-500">(optional)</span>
          <textarea
            name="customerNote"
            maxLength={500}
            rows={3}
            placeholder="Example: Arrive 10 minutes early and bring water."
            className="rounded-xl border border-court-800/20 bg-white px-3 py-2.5 font-normal outline-none placeholder:text-ink-500/60 focus:border-violet-600"
          />
        </label>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={courtNames.length !== 3}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-700 px-5 text-sm font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            Publish Sunday Unli
          </button>
          <p className="mt-2 text-xs leading-5 text-ink-500">
            Publishing fails safely if any court is already booked, blocked, or
            assigned to another event.
          </p>
        </div>
      </form>
    </section>
  );
}
