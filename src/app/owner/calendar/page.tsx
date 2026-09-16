import type { Metadata } from "next";

import { CalendarDayGrid } from "@/components/owner/calendar-day-grid";
import { CalendarWeek } from "@/components/owner/calendar-week";
import {
  addDaysToIsoDate,
  getTodayInManila,
  getWeekStart,
  isIsoDate,
} from "@/lib/dates";
import { getOwnerCalendarData } from "@/lib/data/owner";

export const metadata: Metadata = {
  title: "Calendar",
};

type OwnerCalendarPageProps = {
  searchParams: Promise<{
    week?: string | string[];
    day?: string | string[];
  }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OwnerCalendarPage({
  searchParams,
}: OwnerCalendarPageProps) {
  const params = await searchParams;
  const today = getTodayInManila();
  const requestedWeek = first(params.week);
  const weekAnchor = isIsoDate(requestedWeek) ? requestedWeek : today;
  const weekStart = getWeekStart(weekAnchor);
  const weekEnd = addDaysToIsoDate(weekStart, 6);
  const requestedDay = first(params.day);
  const defaultDay = today >= weekStart && today <= weekEnd ? today : weekStart;
  const selectedDay =
    isIsoDate(requestedDay) &&
    requestedDay >= weekStart &&
    requestedDay <= weekEnd
      ? requestedDay
      : defaultDay;
  const data = await getOwnerCalendarData(weekStart, selectedDay);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-court-700">
            Owner scheduling
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold text-ink-900 sm:text-5xl">
            Calendar
          </h1>
        </div>
        <p className="max-w-lg text-sm leading-6 text-ink-500">
          Review the full week, then select a day to inspect every court by hour.
          Pending receipts stay reserved while they wait for review.
        </p>
      </div>

      <div className="mt-7">
        <CalendarWeek
          weekStart={weekStart}
          selectedDay={selectedDay}
          today={data.today}
          days={data.days}
          previousWeek={addDaysToIsoDate(weekStart, -7)}
          previousDay={addDaysToIsoDate(selectedDay, -7)}
          nextWeek={addDaysToIsoDate(weekStart, 7)}
          nextDay={addDaysToIsoDate(selectedDay, 7)}
          todayWeek={getWeekStart(data.today)}
        />
      </div>

      <div className="mt-7">
        <CalendarDayGrid
          selectedDay={selectedDay}
          courts={data.courts}
          bookings={data.timeline}
          openingHour={data.openingHour}
          closingHour={data.closingHour}
        />
      </div>

      <aside className="mt-7 rounded-2xl border border-dashed border-court-800/20 bg-court-800/5 px-5 py-4 text-sm leading-6 text-ink-500">
        This calendar is currently read-only. Court blocking, open-play publishing,
        and recurring-booking controls are the next Calendar steps.
      </aside>
    </div>
  );
}
