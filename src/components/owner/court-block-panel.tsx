import { createCourtBlockAction } from "@/actions/owner";
import { manilaScheduleFormatter, manilaTimeFormatter } from "@/lib/dates";
import type { OwnerCourtBlockPreview } from "@/lib/data/owner";
import { formatPeso } from "@/lib/money";

type CourtBlockPanelProps = {
  courts: Array<{ id: number; name: string }>;
  today: string;
  weekStart: string;
  selectedDay: string;
  openingHour: number;
  closingHour: number;
  draft: {
    courtId: string;
    date: string;
    startHour: string;
    endHour: string;
    reason: string;
  };
  preview: OwnerCourtBlockPreview | null;
};

function hourLabel(hour: number) {
  if (hour === 24) return "12:00 AM";
  if (hour === 12) return "12:00 PM";

  return `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}`;
}

function paymentLabel(status: string | null) {
  if (!status) return "No payment submitted";

  return status.replaceAll("_", " ");
}

export function CourtBlockPanel({
  courts,
  today,
  weekStart,
  selectedDay,
  openingHour,
  closingHour,
  draft,
  preview,
}: CourtBlockPanelProps) {
  const startHours = Array.from(
    { length: closingHour - openingHour },
    (_, index) => openingHour + index,
  );
  const endHours = Array.from(
    { length: closingHour - openingHour },
    (_, index) => openingHour + index + 1,
  );
  const hasAffectedBookings = Boolean(preview?.affectedBookings.length);
  const cannotConfirm = Boolean(
    preview?.error ||
      preview?.specialConflicts.length ||
      (hasAffectedBookings && !preview?.emailConfigured),
  );

  return (
    <section className="rounded-2xl border border-court-800/10 bg-white">
      <div className="border-b border-court-800/10 px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-court-700">
          Court controls
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold text-ink-900">
          Block a court
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">
          Preview the impact before making a court unavailable. Existing
          customer reservations are never cancelled without a second,
          explicit confirmation.
        </p>
      </div>

      <form
        action="/owner/calendar"
        method="get"
        className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5"
      >
        <input type="hidden" name="week" value={weekStart} />
        <input type="hidden" name="day" value={selectedDay} />

        <label className="grid gap-1.5 text-sm font-bold text-ink-900">
          Court
          <select
            name="blockCourt"
            defaultValue={draft.courtId}
            required
            className="min-h-11 rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-court-700"
          >
            {courts.map((court) => (
              <option key={court.id} value={court.id}>
                {court.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-ink-900">
          Date
          <input
            type="date"
            name="blockDate"
            min={today}
            defaultValue={draft.date}
            required
            className="min-h-11 rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-court-700"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-ink-900">
          Starts
          <select
            name="blockStart"
            defaultValue={draft.startHour}
            required
            className="min-h-11 rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-court-700"
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
            name="blockEnd"
            defaultValue={draft.endHour}
            required
            className="min-h-11 rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-court-700"
          >
            {endHours.map((hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-ink-900 md:col-span-2 xl:col-span-1">
          Reason
          <input
            type="text"
            name="blockReason"
            minLength={3}
            maxLength={240}
            defaultValue={draft.reason}
            placeholder="e.g. Court repair"
            required
            className="min-h-11 rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none placeholder:text-ink-500/60 focus:border-court-700"
          />
        </label>

        <div className="md:col-span-2 xl:col-span-5">
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-court-800 px-5 text-sm font-bold text-court-800 transition hover:bg-court-800/5 sm:w-auto"
          >
            Preview impact
          </button>
        </div>
      </form>

      {preview ? (
        <div className="border-t border-court-800/10 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-court-700">
                Confirmation preview
              </p>
              <h3 className="mt-1 font-display text-xl font-bold text-ink-900">
                {preview.courtName ?? "Court"}
              </h3>
              <p className="mt-1 text-sm text-ink-500">
                {manilaScheduleFormatter.format(new Date(preview.startsAt))} to{" "}
                {manilaTimeFormatter.format(new Date(preview.endsAt))}
              </p>
            </div>
            <span className="w-fit rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">
              {preview.affectedBookings.length} customer {preview.affectedBookings.length === 1 ? "booking" : "bookings"} affected
            </span>
          </div>

          {preview.error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {preview.error}
            </div>
          ) : null}

          {preview.specialConflicts.length > 0 ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <p className="font-bold">This block cannot be created yet.</p>
              <p className="mt-1">
                The selected period overlaps a block or special session. Change
                the time, or manage that schedule first.
              </p>
              <ul className="mt-2 list-disc pl-5">
                {preview.specialConflicts.map((conflict) => (
                  <li key={conflict.id}>
                    {conflict.label} ({conflict.reference})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.affectedBookings.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {preview.affectedBookings.map((booking) => (
                <article
                  key={booking.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-bold text-ink-900">
                        {booking.customerName}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-wide text-ink-500">
                        {booking.reference}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-amber-900">
                      {booking.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-ink-900">
                    {manilaTimeFormatter.format(new Date(booking.startsAt))} -{" "}
                    {manilaTimeFormatter.format(new Date(booking.endsAt))}
                  </p>
                  <p className="mt-1 break-all text-xs text-ink-500">
                    {booking.customerEmail} · {booking.customerPhone}
                  </p>
                  <p className="mt-3 text-xs font-bold capitalize text-ink-500">
                    Payment: {paymentLabel(booking.paymentStatus)}
                    {booking.refundAmount > 0
                      ? ` · ${formatPeso(booking.refundAmount)} refund required`
                      : ""}
                  </p>
                </article>
              ))}
            </div>
          ) : preview.specialConflicts.length === 0 && !preview.error ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              No customer reservations are affected. This will only add a
              blocked period to the calendar.
            </div>
          ) : null}

          {hasAffectedBookings && !preview.emailConfigured ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <p className="font-bold">Customer email is not configured.</p>
              <p className="mt-1">
                Add RESEND_API_KEY and RESEND_FROM_EMAIL before cancelling
                reservations. The final button stays disabled so customers are
                not cancelled silently.
              </p>
            </div>
          ) : null}

          {!preview.error ? (
            <form action={createCourtBlockAction} className="mt-5">
              <input type="hidden" name="courtId" value={preview.selection.courtId} />
              <input type="hidden" name="blockDate" value={preview.selection.date} />
              <input type="hidden" name="startHour" value={preview.selection.startHour} />
              <input type="hidden" name="endHour" value={preview.selection.endHour} />
              <input type="hidden" name="reason" value={preview.selection.reason} />
              {preview.affectedBookings.map((booking) => (
                <input
                  key={booking.id}
                  type="hidden"
                  name="expectedBookingId"
                  value={booking.id}
                />
              ))}

              <label className="flex items-start gap-3 rounded-xl border border-court-800/10 bg-cream-50 p-4 text-sm leading-6 text-ink-900">
                <input
                  type="checkbox"
                  name="confirmed"
                  value="yes"
                  required
                  disabled={cannotConfirm}
                  className="mt-1 size-4 accent-court-800"
                />
                <span>
                  I confirm this court block
                  {hasAffectedBookings
                    ? ` and the cancellation of ${preview.affectedBookings.length} customer ${preview.affectedBookings.length === 1 ? "booking" : "bookings"}`
                    : ""}
                  . I understand that verified payments will be marked for
                  refund.
                </span>
              </label>

              <button
                type="submit"
                disabled={cannotConfirm}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-court-800 px-5 text-sm font-bold text-white transition hover:bg-court-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
              >
                Confirm court block
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
