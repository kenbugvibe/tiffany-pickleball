import Link from "next/link";

import type {
  AvailabilityRow,
  AvailabilityStatus,
} from "@/lib/data/availability";

type DaySummary = {
  date: string;
  dayLabel: string;
  dateLabel: string;
  openCount: number;
  hasOpenPlay: boolean;
  hasSundayUnli: boolean;
  eventPrice: number | null;
  isPast: boolean;
};

type AvailabilityBoardProps = {
  days: DaySummary[];
  rows: AvailabilityRow[];
  selectedDate: string;
  previousWeek: string | null;
  nextWeek: string;
};

type DayCardProps = {
  day: DaySummary;
  selected: boolean;
};

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const dayHeadingFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const dateRangeFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
});

function toDate(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

function formatPrice(price: number) {
  return pesoFormatter.format(price);
}

function signInHref(next: string) {
  return {
    pathname: "/sign-in",
    query: { next },
  };
}

function getNextPath(row: AvailabilityRow, selectedDate: string) {
  if (row.availability_status === "open_play" && row.entry_id) {
    const params = new URLSearchParams({ session: row.entry_id });
    return `/open-play?${params.toString()}`;
  }

  const params = new URLSearchParams({
    date: selectedDate,
    court: String(row.court_id),
    startsAt: row.starts_at,
  });

  return `/book?${params.toString()}`;
}

function getStatusLabel(row: AvailabilityRow) {
  switch (row.availability_status) {
    case "available":
      return "Available";
    case "open_play":
      return row.entry_price
        ? `Open play · ${formatPrice(row.entry_price)}`
        : "Open play";
    case "sunday_unli":
      return row.entry_price
        ? `Unli · ${formatPrice(row.entry_price)}`
        : "Sunday unli";
    case "blocked":
      return "Closed";
    default:
      return "Booked";
  }
}

function getSlotSummary(rows: AvailabilityRow[]) {
  const availableCount = rows.filter(
    (row) => row.availability_status === "available",
  ).length;
  const event = rows.find(
    (row) =>
      row.availability_status === "open_play" ||
      row.availability_status === "sunday_unli",
  );

  if (availableCount > 0) {
    return {
      label: `${availableCount} ${availableCount === 1 ? "court" : "courts"} open`,
      price: `From ${formatPrice(rows[0].court_price)}`,
    };
  }

  if (event?.entry_price) {
    return {
      label:
        event.availability_status === "sunday_unli"
          ? "Sunday unli play"
          : "Open play available",
      price: `${formatPrice(event.entry_price)} entry`,
    };
  }

  return { label: "No courts open", price: "Unavailable" };
}

function CourtStatus({
  row,
  selectedDate,
}: {
  row: AvailabilityRow;
  selectedDate: string;
}) {
  const interactive =
    row.availability_status === "available" ||
    (row.availability_status === "open_play" && Boolean(row.entry_id));
  const statusStyles: Record<AvailabilityStatus, string> = {
    available:
      "border-court-800/15 bg-white text-court-950 hover:border-gold-500 hover:shadow-[0_4px_14px_rgba(7,52,28,0.09)]",
    booked: "border-transparent bg-[#edeae1] text-[#7d857f]",
    blocked:
      "border-transparent text-[#6f756d] [background-image:repeating-linear-gradient(45deg,#edeae1_0_6px,#dfdacc_6px_12px)]",
    open_play:
      "border-gold-500 bg-[#fbf1d4] text-[#6b540c] hover:shadow-[0_4px_14px_rgba(200,155,32,0.2)]",
    sunday_unli:
      "border-court-800 bg-court-950 text-gold-200 hover:bg-court-800",
  };
  const content = (
    <>
      <span className="text-[11px] font-bold leading-tight sm:text-xs">
        {row.court_name}
      </span>
      <span className="mt-1 text-[10px] font-medium leading-tight sm:text-[11px]">
        {getStatusLabel(row)}
      </span>
    </>
  );
  const className = `flex min-h-16 flex-col justify-center rounded-xl border px-2.5 py-2.5 transition ${statusStyles[row.availability_status]}`;

  if (!interactive) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link
      className={className}
      href={signInHref(getNextPath(row, selectedDate))}
      prefetch={false}
      aria-label={`${row.court_name}, ${getStatusLabel(row)}. Sign in to continue.`}
    >
      {content}
    </Link>
  );
}

function DayCard({ day, selected }: DayCardProps) {
  const eventLabel = day.eventPrice ? formatPrice(day.eventPrice) : null;
  const detail = day.isPast
    ? "Past"
    : day.hasSundayUnli
      ? `Unli${eventLabel ? ` · ${eventLabel}` : ""}`
      : day.hasOpenPlay
        ? `Open play${eventLabel ? ` · ${eventLabel}` : ""}`
        : `${day.openCount} open`;
  const classes = selected
    ? "border-court-800 bg-court-800 text-white shadow-[0_5px_0_#c89b20]"
    : day.isPast
      ? "border-transparent bg-[#f1eee6] text-ink-500/45"
      : "border-court-800/10 bg-cream-50 text-ink-900 hover:border-gold-500";
  const content = (
    <>
      <span className="block text-xs font-semibold uppercase tracking-wide opacity-70">
        {day.dayLabel}
      </span>
      <span className="mt-1 block font-display text-xl font-bold">
        {day.dateLabel}
      </span>
      <span
        className={`mt-1 block text-[10px] font-semibold ${
          selected ? "text-gold-200" : "text-ink-500"
        }`}
      >
        {detail}
      </span>
    </>
  );
  const className = `min-h-20 rounded-xl border px-3 py-3 transition ${classes}`;

  if (day.isPast) {
    return (
      <span className={className} aria-label={`${day.dayLabel} ${day.dateLabel}, past date`}>
        {content}
      </span>
    );
  }

  return (
    <Link
      href={`/?date=${day.date}#availability`}
      aria-current={selected ? "date" : undefined}
      aria-label={`${day.dayLabel} ${day.dateLabel}, ${detail}`}
      className={className}
    >
      {content}
    </Link>
  );
}

export function AvailabilityBoard({
  days,
  rows,
  selectedDate,
  previousWeek,
  nextWeek,
}: AvailabilityBoardProps) {
  const rowsByTime = new Map<string, AvailabilityRow[]>();

  rows.forEach((row) => {
    const slot = rowsByTime.get(row.starts_at) ?? [];
    slot.push(row);
    rowsByTime.set(row.starts_at, slot);
  });

  const slots = Array.from(rowsByTime.entries()).sort(([first], [second]) =>
    first.localeCompare(second),
  );

  return (
    <section id="availability" className="scroll-mt-24 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-court-700">
              Live court schedule
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-ink-900 sm:text-4xl">
              Choose your play date
            </h2>
          </div>
          <div className="hidden items-center gap-2 text-xs text-ink-500 sm:flex">
            <span className="size-2 rounded-full bg-court-700" />
            Updated from Supabase
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-court-800/10 bg-white p-3 shadow-[0_12px_38px_rgba(7,52,28,0.07)] sm:p-5">
          <div className="flex items-center justify-between px-1 pb-3">
            {previousWeek ? (
              <Link
                className="grid size-11 place-items-center rounded-full border border-court-800/15 text-xl text-court-800 transition hover:border-gold-500"
                href={`/?date=${previousWeek}#availability`}
                aria-label="Previous week"
              >
                ←
              </Link>
            ) : (
              <span
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-full border border-transparent text-xl text-ink-500/25"
              >
                ←
              </span>
            )}
            <p className="font-display text-base font-semibold text-ink-900 sm:text-lg">
              {dateRangeFormatter.format(toDate(days[0].date))}
              <span className="mx-1.5 text-ink-500/40">—</span>
              {dateRangeFormatter.format(toDate(days[days.length - 1].date))}
            </p>
            <Link
              className="grid size-11 place-items-center rounded-full border border-court-800/15 text-xl text-court-800 transition hover:border-gold-500"
              href={`/?date=${nextWeek}#availability`}
              aria-label="Next week"
            >
              →
            </Link>
          </div>

          <div className="-mx-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
            <div className="grid min-w-[650px] grid-cols-7 gap-2">
              {days.map((day) => (
                <DayCard
                  key={day.date}
                  day={day}
                  selected={day.date === selectedDate}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-display text-2xl font-bold text-ink-900">
              {dayHeadingFormatter.format(toDate(selectedDate))}
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              Tap an available court or play event, then sign in to continue.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-court-800/20 bg-white" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-gold-500 bg-[#fbf1d4]" />
              Open play
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[#edeae1]" />
              Unavailable
            </span>
          </div>
        </div>

        {slots.length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {slots.map(([startsAt, courtRows]) => {
              const sortedRows = [...courtRows].sort(
                (first, second) => first.court_id - second.court_id,
              );
              const summary = getSlotSummary(sortedRows);

              return (
                <article
                  key={startsAt}
                  className="rounded-2xl border border-court-800/10 bg-white p-4 shadow-[0_5px_20px_rgba(7,52,28,0.045)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-base font-semibold text-ink-900">
                        {timeFormatter.format(new Date(startsAt))}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {summary.label}
                      </p>
                    </div>
                    <p className="rounded-full bg-cream-50 px-2.5 py-1 text-[11px] font-bold text-court-800">
                      {summary.price}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {sortedRows.map((row) => (
                      <CourtStatus
                        key={row.court_id}
                        row={row}
                        selectedDate={selectedDate}
                      />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-court-800/10 bg-white p-8 text-center">
            <p className="font-display text-xl font-semibold text-ink-900">
              No schedule is available for this date.
            </p>
            <p className="mt-2 text-sm text-ink-500">
              Choose another day or check back later.
            </p>
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-gold-500/40 bg-[#fbf1d4] p-4 text-sm leading-6 text-[#6b540c] sm:flex sm:items-center sm:justify-between sm:gap-5">
          <p>
            Published open-play and Sunday-unli sessions appear in gold with
            their per-person entry price.
          </p>
          <p className="mt-2 shrink-0 font-semibold text-court-800 sm:mt-0">
            Tap open play to register
          </p>
        </div>
      </div>
    </section>
  );
}
