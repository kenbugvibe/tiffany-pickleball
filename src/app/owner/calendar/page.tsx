import type { Metadata } from "next";

import { CalendarDayGrid } from "@/components/owner/calendar-day-grid";
import { CalendarWeek } from "@/components/owner/calendar-week";
import { CourtBlockPanel } from "@/components/owner/court-block-panel";
import { OpenPlayPanel } from "@/components/owner/open-play-panel";
import { SundayUnliPanel } from "@/components/owner/sunday-unli-panel";
import { parseCourtBlockSelection } from "@/lib/court-blocks";
import {
  addDaysToIsoDate,
  getTodayInManila,
  getWeekStart,
  isIsoDate,
} from "@/lib/dates";
import {
  getCourtBlockPreview,
  getOwnerCalendarData,
} from "@/lib/data/owner";

export const metadata: Metadata = {
  title: "Calendar",
};

type OwnerCalendarPageProps = {
  searchParams: Promise<{
    week?: string | string[];
    day?: string | string[];
    blockCourt?: string | string[];
    blockDate?: string | string[];
    blockStart?: string | string[];
    blockEnd?: string | string[];
    blockReason?: string | string[];
    blocked?: string | string[];
    blockedCount?: string | string[];
    unblocked?: string | string[];
    publishedOpenPlay?: string | string[];
    removedOpenPlay?: string | string[];
    publishedSundayUnli?: string | string[];
    removedSundayUnli?: string | string[];
    cancelled?: string | string[];
    emailFailed?: string | string[];
    error?: string | string[];
  }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function all(value: string | string[] | undefined) {
  if (value === undefined) return [];

  return Array.isArray(value) ? value : [value];
}

export default async function OwnerCalendarPage({
  searchParams,
}: OwnerCalendarPageProps) {
  const params = await searchParams;
  const today = getTodayInManila();
  const requestedWeek = first(params.week);
  const requestedBlockDate = first(params.blockDate);
  const blockFocusDate = isIsoDate(requestedBlockDate)
    ? requestedBlockDate
    : null;
  const weekAnchor = blockFocusDate ?? (isIsoDate(requestedWeek) ? requestedWeek : today);
  const weekStart = getWeekStart(weekAnchor);
  const weekEnd = addDaysToIsoDate(weekStart, 6);
  const requestedDay = first(params.day);
  const defaultDay = today >= weekStart && today <= weekEnd ? today : weekStart;
  const selectedDay = blockFocusDate ??
    (isIsoDate(requestedDay) &&
    requestedDay >= weekStart &&
    requestedDay <= weekEnd
      ? requestedDay
      : defaultDay);
  const rawBlockInput = {
    courtIds: all(params.blockCourt),
    date: first(params.blockDate),
    startHour: first(params.blockStart),
    endHour: first(params.blockEnd),
    reason: first(params.blockReason),
  };
  const hasBlockInput =
    rawBlockInput.courtIds.length > 0 ||
    [
      rawBlockInput.date,
      rawBlockInput.startHour,
      rawBlockInput.endHour,
      rawBlockInput.reason,
    ].some((value) => value !== undefined);
  const parsedBlock = hasBlockInput
    ? parseCourtBlockSelection(rawBlockInput)
    : null;
  const [data, blockPreview] = await Promise.all([
    getOwnerCalendarData(weekStart, selectedDay),
    parsedBlock?.ok
      ? getCourtBlockPreview(parsedBlock.value)
      : Promise.resolve(null),
  ]);
  const blocked = first(params.blocked);
  const blockedCount = Number(first(params.blockedCount) ?? 1);
  const unblocked = first(params.unblocked);
  const publishedOpenPlay = first(params.publishedOpenPlay);
  const removedOpenPlay = first(params.removedOpenPlay);
  const publishedSundayUnli = first(params.publishedSundayUnli);
  const removedSundayUnli = first(params.removedSundayUnli);
  const cancelled = Number(first(params.cancelled) ?? 0);
  const emailFailed = Number(first(params.emailFailed) ?? 0);
  const error = first(params.error);
  const errorMessages: Record<string, string> = {
    "invalid-block": "The court block details were invalid. Review the fields and try again.",
    "confirmation-required": "Check the confirmation box before creating the court block.",
    "schedule-changed": "The schedule changed after your preview. Review the affected bookings again before confirming.",
    "special-conflict": "That period now overlaps a block or special session. Choose another time or manage that schedule first.",
    "email-not-configured": "Customer email must be configured before reservations can be cancelled.",
    "block-failed": "The court block could not be created. Confirm the Phase 4 migration is applied, then preview it again.",
    "invalid-remove-block": "The selected court block was invalid.",
    "remove-confirmation-required": "Confirm that you want to reopen the blocked period.",
    "remove-block-failed": "The court block could not be removed. Confirm the remove-block migration is applied, then try again.",
    "invalid-open-play": "The open-play details were invalid. Review the fields and try again.",
    "open-play-in-past": "Choose an open-play session that starts in the future.",
    "open-play-conflict": "One or more selected courts are already occupied during that period. Change the court selection or time.",
    "open-play-publish-failed": "Open play could not be published. Confirm the Open Play migration is applied, then try again.",
    "invalid-remove-open-play": "The selected open-play session was invalid.",
    "remove-open-play-confirmation-required": "Confirm that you want to remove the open-play session.",
    "open-play-has-participants": "This open-play session already has participants. It cannot be removed until the participant-cancellation workflow is available.",
    "remove-open-play-failed": "The open-play session could not be removed. Confirm the Open Play migration is applied, then try again.",
    "invalid-sunday-unli": "Choose a valid Sunday and review the Sunday Unli details.",
    "sunday-unli-in-past": "Choose a future Sunday Unli session.",
    "sunday-unli-conflict": "One or more courts are already occupied Sunday evening. Remove the conflict or choose another Sunday.",
    "sunday-unli-publish-failed": "Sunday Unli could not be published. Confirm the Sunday Unli migration is applied, then try again.",
    "invalid-remove-sunday-unli": "The selected Sunday Unli session was invalid.",
    "remove-sunday-unli-confirmation-required": "Confirm that you want to remove the Sunday Unli session.",
    "sunday-unli-has-participants": "This Sunday Unli session already has participants. It cannot be removed until the participant-cancellation workflow is available.",
    "remove-sunday-unli-failed": "The Sunday Unli session could not be removed. Confirm the Sunday Unli migration is applied, then try again.",
  };
  const selectedError = error ? errorMessages[error] : null;
  const inputError = parsedBlock && !parsedBlock.ok ? parsedBlock.error : null;
  const defaultCourtId = String(data.courts[0]?.id ?? "");
  const draft = parsedBlock?.ok
    ? {
        courtIds: parsedBlock.value.courtIds.map(String),
        date: parsedBlock.value.date,
        startHour: String(parsedBlock.value.startHour),
        endHour: String(parsedBlock.value.endHour),
        reason: parsedBlock.value.reason,
      }
    : {
        courtIds: defaultCourtId ? [defaultCourtId] : [],
        date: selectedDay >= data.today ? selectedDay : data.today,
        startHour: String(data.openingHour),
        endHour: String(data.openingHour + 1),
        reason: "",
      };

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

      {blocked ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Court {blockedCount === 1 ? "block" : "blocks"} {blocked} created.
          {cancelled > 0
            ? ` ${cancelled} customer ${cancelled === 1 ? "booking was" : "bookings were"} cancelled.`
            : " No customer bookings were affected."}
        </div>
      ) : null}

      {unblocked ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Court block {unblocked} removed. The period is available for new
          bookings again.
        </div>
      ) : null}

      {publishedOpenPlay ? (
        <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900">
          Open-play session {publishedOpenPlay} published. It is now visible on
          public availability.
        </div>
      ) : null}

      {removedOpenPlay ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Open-play session {removedOpenPlay} removed. The court period is
          available for new bookings again.
        </div>
      ) : null}

      {publishedSundayUnli ? (
        <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-900">
          Sunday Unli session {publishedSundayUnli} published. It is now
          visible on public availability.
        </div>
      ) : null}

      {removedSundayUnli ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Sunday Unli session {removedSundayUnli} removed. All three courts are
          available for new bookings again.
        </div>
      ) : null}

      {emailFailed > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-bold">
            {emailFailed} cancellation {emailFailed === 1 ? "email" : "emails"} could not be delivered.
          </span>{" "}
          The court block and cancellations were saved. The failed notice is
          recorded for follow-up.
        </div>
      ) : null}

      {selectedError || inputError ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {selectedError ?? inputError}
        </div>
      ) : null}

      <div className="mt-7">
        <CalendarDayGrid
          selectedDay={selectedDay}
          courts={data.courts}
          bookings={data.timeline}
          openingHour={data.openingHour}
          closingHour={data.closingHour}
          nowIso={data.nowIso}
        />
      </div>

      <div className="mt-7">
        <SundayUnliPanel
          today={data.today}
          selectedDay={selectedDay}
          courtNames={data.courts.map((court) => court.name)}
          pricePerPlayer={data.sundayUnliPricePerPlayer}
        />
      </div>

      <div className="mt-7">
        <OpenPlayPanel
          courts={data.courts}
          today={data.today}
          selectedDay={selectedDay}
          openingHour={data.openingHour}
          closingHour={data.closingHour}
          pricePerPlayer={data.openPlayPricePerPlayer}
        />
      </div>

      <div className="mt-7">
        <CourtBlockPanel
          courts={data.courts}
          today={data.today}
          weekStart={weekStart}
          selectedDay={selectedDay}
          openingHour={data.openingHour}
          closingHour={data.closingHour}
          draft={draft}
          preview={blockPreview}
        />
      </div>
    </div>
  );
}
