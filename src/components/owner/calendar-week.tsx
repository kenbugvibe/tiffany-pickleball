import Link from "next/link";

import type { OwnerCalendarDaySummary } from "@/lib/data/owner";

type CalendarWeekProps = {
  weekStart: string;
  selectedDay: string;
  today: string;
  days: OwnerCalendarDaySummary[];
  previousWeek: string;
  previousDay: string;
  nextWeek: string;
  nextDay: string;
  todayWeek: string;
};

const weekdayFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  weekday: "short",
});

const dayFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  month: "short",
});

function utcDate(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

function formatWeekRange(days: OwnerCalendarDaySummary[]) {
  const first = utcDate(days[0].date);
  const last = utcDate(days[days.length - 1].date);
  const firstMonth = monthFormatter.format(first);
  const lastMonth = monthFormatter.format(last);
  const firstDay = first.getUTCDate();
  const lastDay = last.getUTCDate();
  const firstYear = first.getUTCFullYear();
  const lastYear = last.getUTCFullYear();

  if (firstYear !== lastYear) {
    return `${firstMonth} ${firstDay}, ${firstYear} - ${lastMonth} ${lastDay}, ${lastYear}`;
  }

  if (firstMonth !== lastMonth) {
    return `${firstMonth} ${firstDay} - ${lastMonth} ${lastDay}, ${lastYear}`;
  }

  return `${firstMonth} ${firstDay}-${lastDay}, ${lastYear}`;
}

function calendarHref(week: string, day: string) {
  return `/owner/calendar?week=${week}&day=${day}`;
}

export function CalendarWeek({
  weekStart,
  selectedDay,
  today,
  days,
  previousWeek,
  previousDay,
  nextWeek,
  nextDay,
  todayWeek,
}: CalendarWeekProps) {
  return (
    <section className="rounded-2xl border border-court-800/10 bg-white">
      <div className="flex flex-col gap-4 border-b border-court-800/10 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-court-700">
            Week view
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink-900">
            {formatWeekRange(days)}
          </h2>
        </div>

        <nav
          aria-label="Calendar week navigation"
          className="grid grid-cols-3 gap-2 sm:flex"
        >
          <Link
            href={calendarHref(previousWeek, previousDay)}
            aria-label="Previous week"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-court-800/15 px-4 text-sm font-bold text-court-800 transition hover:bg-court-800/5"
          >
            Previous
          </Link>
          <Link
            href={calendarHref(todayWeek, today)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-court-800/15 px-4 text-sm font-bold text-court-800 transition hover:bg-court-800/5"
          >
            Today
          </Link>
          <Link
            href={calendarHref(nextWeek, nextDay)}
            aria-label="Next week"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-court-800 px-4 text-sm font-bold text-white transition hover:bg-court-700"
          >
            Next
          </Link>
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 sm:p-4 xl:grid-cols-7">
        {days.map((day) => {
          const selected = day.date === selectedDay;
          const isToday = day.date === today;

          return (
            <Link
              key={day.date}
              href={calendarHref(weekStart, day.date)}
              aria-current={selected ? "date" : undefined}
              className={`min-h-40 rounded-xl border p-3 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-court-700 ${
                selected
                  ? "border-court-800 bg-court-800 text-white shadow-sm"
                  : "border-court-800/10 bg-cream-50 text-ink-900 hover:border-court-800/30 hover:bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
                      selected ? "text-gold-200" : "text-court-700"
                    }`}
                  >
                    {weekdayFormatter.format(utcDate(day.date))}
                  </p>
                  <p className="mt-1 font-display text-xl font-bold">
                    {dayFormatter.format(utcDate(day.date))}
                  </p>
                </div>
                {isToday ? (
                  <span
                    className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${
                      selected
                        ? "bg-gold-200 text-court-950"
                        : "bg-gold-200/60 text-court-950"
                    }`}
                  >
                    Today
                  </span>
                ) : null}
              </div>

              <p
                className={`mt-4 text-sm font-bold ${
                  selected ? "text-white" : "text-ink-900"
                }`}
              >
                {day.entryCount === 0
                  ? "No scheduled activity"
                  : `${day.entryCount} scheduled ${day.entryCount === 1 ? "block" : "blocks"}`}
              </p>
              <p
                className={`mt-1 font-mono text-[10px] ${
                  selected ? "text-white/65" : "text-ink-500"
                }`}
              >
                {day.occupancyPercent}% occupied
              </p>

              <div className="mt-3 flex flex-wrap gap-1" aria-label="Day indicators">
                {day.pendingCount > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-900">
                    {day.pendingCount} pending
                  </span>
                ) : null}
                {day.blockedCount > 0 ? (
                  <span className="rounded-full bg-slate-200 px-2 py-1 text-[9px] font-bold text-slate-800">
                    {day.blockedCount} blocked
                  </span>
                ) : null}
                {day.hasOpenPlay ? (
                  <span className="rounded-full bg-sky-100 px-2 py-1 text-[9px] font-bold text-sky-900">
                    Open play
                  </span>
                ) : null}
                {day.hasSundayUnli ? (
                  <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-bold text-violet-900">
                    Sunday unli
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
