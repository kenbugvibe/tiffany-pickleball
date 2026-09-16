import Link from "next/link";

import { AvailabilityBoard } from "@/components/booking/availability-board";
import {
  COURT_ADDRESS,
  COURT_REGION_SHORT,
  CourtLocation,
} from "@/components/shared/court-location";
import { SiteNav } from "@/components/shared/site-nav";
import {
  getAvailabilityForDays,
  type AvailabilityRow,
} from "@/lib/data/availability";

type HomePageProps = {
  searchParams: Promise<{ date?: string | string[] }>;
};

const manilaDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabelFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  weekday: "short",
});

const dateLabelFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

function toDate(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function getTodayInManila() {
  const parts = manilaDateFormatter.formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function isValidDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = toDate(value);
  return !Number.isNaN(date.valueOf()) && toIsoDate(date) === value;
}

function getWeekStart(date: Date) {
  return addDays(date, -date.getUTCDay());
}

function summarizeDay(date: string, rows: AvailabilityRow[], today: string) {
  const parsedDate = toDate(date);
  const event = rows.find(
    (row) =>
      row.availability_status === "open_play" ||
      row.availability_status === "sunday_unli",
  );

  return {
    date,
    dayLabel: dayLabelFormatter.format(parsedDate),
    dateLabel: dateLabelFormatter.format(parsedDate),
    openCount: rows.filter(
      (row) => row.availability_status === "available",
    ).length,
    hasOpenPlay: rows.some(
      (row) => row.availability_status === "open_play",
    ),
    hasSundayUnli: rows.some(
      (row) => row.availability_status === "sunday_unli",
    ),
    eventPrice: event?.entry_price ?? null,
    isPast: date < today,
  };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const today = getTodayInManila();
  const requestedDate = (await searchParams).date;
  const requestedValue = Array.isArray(requestedDate)
    ? requestedDate[0]
    : requestedDate;
  const selectedDate =
    isValidDate(requestedValue) && requestedValue >= today
      ? requestedValue
      : today;
  const selected = toDate(selectedDate);
  const weekStart = getWeekStart(selected);
  const currentWeekStart = getWeekStart(toDate(today));
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    toIsoDate(addDays(weekStart, index)),
  );
  const availability = await getAvailabilityForDays(weekDates);
  const selectedRows = availability[selectedDate] ?? [];
  const days = weekDates.map((date) =>
    summarizeDay(date, availability[date] ?? [], today),
  );
  const previousWeek =
    weekStart > currentWeekStart
      ? toIsoDate(addDays(weekStart, -7))
      : null;
  const nextWeek = toIsoDate(addDays(weekStart, 7));
  const courtCount = new Set(selectedRows.map((row) => row.court_id)).size;

  return (
    <main className="min-h-screen overflow-hidden bg-cream-50">
      <header className="relative z-10 border-b border-white/10 bg-court-950 text-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="Tiffany's Pickleball Court home"
          >
            <span
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-full border border-gold-200/40 bg-court-800 font-mono text-xs font-semibold text-gold-200"
            >
              TP
            </span>
            <span>
              <span className="block font-display text-base font-bold leading-none tracking-wide text-gold-200 sm:text-lg">
                TIFFANY&apos;S
              </span>
              <span className="mt-1 block text-[9px] font-semibold tracking-[0.18em] text-white/55">
                PICKLEBALL COURT
              </span>
            </span>
          </Link>

          <SiteNav />
        </div>
      </header>

      <section className="relative bg-court-800 text-white">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(240,214,138,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(240,214,138,.18)_1px,transparent_1px)] [background-size:42px_42px]"
        />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1fr_330px] lg:items-end lg:py-20">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-200">
              Indoor pickleball · {COURT_REGION_SHORT}
            </p>
            <h1 className="mt-4 font-display text-5xl font-bold leading-[0.93] tracking-[-0.02em] sm:text-7xl">
              Find your court.
              <span className="block text-gold-200">Play your game.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/75 sm:text-lg">
              See every available hour before signing in. Choose a court, pay
              through GCash, and send your receipt to reserve the slot.
            </p>
            <Link
              href="#availability"
              className="mt-7 inline-flex min-h-12 items-center rounded-xl bg-gold-500 px-6 font-bold text-court-950 shadow-[0_12px_30px_rgba(0,0,0,.18)] transition hover:bg-gold-200"
            >
              Check available times ↓
            </Link>
          </div>

          <div className="rounded-2xl border border-gold-200/30 bg-court-950/55 p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-gold-200">
              <span className="size-2.5 rounded-full bg-gold-200 shadow-[0_0_0_5px_rgba(240,214,138,.12)]" />
              Live availability
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">
                  Schedule
                </dt>
                <dd className="mt-1 font-display text-xl font-semibold">
                  Hourly slots
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">
                  Courts today
                </dt>
                <dd className="mt-1 font-display text-xl font-semibold">
                  {courtCount} indoor
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <AvailabilityBoard
        days={days}
        rows={selectedRows}
        selectedDate={selectedDate}
        previousWeek={previousWeek}
        nextWeek={nextWeek}
      />

      <CourtLocation />

      <footer className="border-t border-court-800/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-7 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="font-display font-semibold text-ink-900">
            Tiffany&apos;s Pickleball Court
          </p>
          <p>{COURT_ADDRESS}</p>
        </div>
      </footer>
    </main>
  );
}
