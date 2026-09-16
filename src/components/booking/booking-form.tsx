"use client";

import { useActionState, useMemo, useState } from "react";

import { createBookingHoldAction } from "@/actions/bookings";
import { emptyBookingActionState } from "@/lib/booking-form-state";
import type { AvailabilityRow } from "@/lib/data/availability";
import { manilaTimeFormatter } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

type BookingFormProps = {
  rows: AvailabilityRow[];
  selectedDate: string;
  initialCourtId: number | null;
  initialStartsAt: string | null;
  paddlePricePerHour: number;
  paymentConfigured: boolean;
};

function sortedUniqueCourtIds(rows: AvailabilityRow[]) {
  return Array.from(new Set(rows.map((row) => row.court_id))).sort(
    (first, second) => first - second,
  );
}

export function BookingForm({
  rows,
  selectedDate,
  initialCourtId,
  initialStartsAt,
  paddlePricePerHour,
  paymentConfigured,
}: BookingFormProps) {
  const courtIds = useMemo(() => sortedUniqueCourtIds(rows), [rows]);
  const defaultCourt =
    initialCourtId && courtIds.includes(initialCourtId)
      ? initialCourtId
      : (courtIds[0] ?? null);
  const [courtId, setCourtId] = useState<number | null>(defaultCourt);
  const [selectedStarts, setSelectedStarts] = useState<string[]>(() => {
    const initial = rows.find(
      (row) =>
        row.court_id === defaultCourt &&
        row.starts_at === initialStartsAt &&
        row.availability_status === "available" &&
        new Date(row.starts_at) > new Date(),
    );

    return initial ? [initial.starts_at] : [];
  });
  const [paddleCount, setPaddleCount] = useState(0);
  const [state, formAction, pending] = useActionState(
    createBookingHoldAction,
    emptyBookingActionState,
  );

  const courtRows = rows
    .filter((row) => row.court_id === courtId)
    .sort((first, second) => first.starts_at.localeCompare(second.starts_at));
  const selectedRows = courtRows.filter((row) =>
    selectedStarts.includes(row.starts_at),
  );
  const selectedIndices = selectedRows.map((row) => courtRows.indexOf(row));
  const courtFee = selectedRows.reduce(
    (total, row) => total + row.court_price,
    0,
  );
  const duration = selectedRows.length;
  const paddleFee = paddleCount * paddlePricePerHour * duration;
  const total = courtFee + paddleFee;
  const firstSlot = selectedRows[0] ?? null;
  const lastSlot = selectedRows[selectedRows.length - 1] ?? null;

  function selectCourt(nextCourtId: number) {
    setCourtId(nextCourtId);
    setSelectedStarts([]);
  }

  function toggleSlot(row: AvailabilityRow, index: number) {
    const available =
      row.availability_status === "available" &&
      new Date(row.starts_at) > new Date();

    if (!available) {
      return;
    }

    if (selectedStarts.includes(row.starts_at)) {
      if (selectedStarts.length === 1) {
        setSelectedStarts([]);
        return;
      }

      const firstIndex = Math.min(...selectedIndices);
      const lastIndex = Math.max(...selectedIndices);

      if (index === firstIndex || index === lastIndex) {
        setSelectedStarts((current) =>
          current.filter((startsAt) => startsAt !== row.starts_at),
        );
      } else {
        setSelectedStarts([row.starts_at]);
      }

      return;
    }

    if (selectedStarts.length === 0) {
      setSelectedStarts([row.starts_at]);
      return;
    }

    const firstIndex = Math.min(...selectedIndices);
    const lastIndex = Math.max(...selectedIndices);

    if (index === firstIndex - 1 || index === lastIndex + 1) {
      setSelectedStarts((current) => [...current, row.starts_at].sort());
    } else {
      setSelectedStarts([row.starts_at]);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="courtId" value={courtId ?? ""} />
      <input
        type="hidden"
        name="startsAt"
        value={firstSlot?.starts_at ?? ""}
      />
      <input
        type="hidden"
        name="endsAt"
        value={lastSlot?.ends_at ?? ""}
      />
      <input type="hidden" name="paddleCount" value={paddleCount} />

      <section className="rounded-2xl border border-court-800/10 bg-white p-5 shadow-[0_8px_30px_rgba(7,52,28,.06)] sm:p-7">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-court-700">
          Step 1
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink-900">
          Select your court
        </h1>
        <p className="mt-2 text-sm text-ink-500">Booking date: {selectedDate}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {courtIds.map((id) => {
            const courtSlots = rows.filter((row) => row.court_id === id);
            const name = courtSlots[0]?.court_name ?? `Court ${id}`;
            const openCount = courtSlots.filter(
              (row) =>
                row.availability_status === "available" &&
                new Date(row.starts_at) > new Date(),
            ).length;
            const selected = id === courtId;

            return (
              <button
                key={id}
                type="button"
                onClick={() => selectCourt(id)}
                aria-pressed={selected}
                className={`min-h-20 rounded-xl border px-4 py-3 text-left transition ${
                  selected
                    ? "border-court-800 bg-court-800 text-white"
                    : "border-court-800/15 bg-cream-50 text-ink-900 hover:border-gold-500"
                }`}
              >
                <span className="block font-display text-lg font-bold">
                  {name}
                </span>
                <span
                  className={`mt-1 block text-xs ${
                    selected ? "text-gold-200" : "text-ink-500"
                  }`}
                >
                  {openCount} open {openCount === 1 ? "hour" : "hours"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-court-800/10 bg-white p-5 shadow-[0_8px_30px_rgba(7,52,28,.06)] sm:p-7">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-court-700">
          Step 2
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold text-ink-900">
          Select consecutive times
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          Tap an open hour to start. Tap the hour immediately before or after it
          to extend your booking.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {courtRows.map((row, index) => {
            const available =
              row.availability_status === "available" &&
              new Date(row.starts_at) > new Date();
            const selected = selectedStarts.includes(row.starts_at);

            return (
              <button
                key={row.starts_at}
                type="button"
                disabled={!available}
                aria-pressed={selected}
                onClick={() => toggleSlot(row, index)}
                className={`min-h-16 rounded-xl border px-3 py-2 text-left transition ${
                  selected
                    ? "border-gold-500 bg-gold-500 text-court-950 shadow-[0_4px_0_#8f6c10]"
                    : available
                      ? "border-court-800/15 bg-white text-ink-900 hover:border-gold-500"
                      : "cursor-not-allowed border-transparent bg-[#edeae1] text-ink-500/55"
                }`}
              >
                <span className="block font-mono text-sm font-bold">
                  {manilaTimeFormatter.format(new Date(row.starts_at))}
                </span>
                <span className="mt-1 block text-xs">
                  {available ? formatPeso(row.court_price) : "Unavailable"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-court-800/10 bg-white p-5 shadow-[0_8px_30px_rgba(7,52,28,.06)] sm:p-7">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-court-700">
          Step 3
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold text-ink-900">
          Add paddle rentals
        </h2>
        <p className="mt-2 text-sm text-ink-500">
          {formatPeso(paddlePricePerHour)} per paddle, per hour.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPaddleCount((count) => Math.max(0, count - 1))}
            disabled={paddleCount === 0}
            aria-label="Remove one paddle"
            className="grid size-12 place-items-center rounded-xl border border-court-800/20 text-xl font-bold text-court-800 disabled:opacity-35"
          >
            −
          </button>
          <output
            aria-live="polite"
            className="grid min-h-12 min-w-20 place-items-center rounded-xl bg-cream-50 px-5 font-mono text-xl font-bold text-ink-900"
          >
            {paddleCount}
          </output>
          <button
            type="button"
            onClick={() => setPaddleCount((count) => count + 1)}
            aria-label="Add one paddle"
            className="grid size-12 place-items-center rounded-xl bg-court-800 text-xl font-bold text-white hover:bg-court-700"
          >
            +
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-court-950 p-5 text-white shadow-[0_12px_35px_rgba(7,52,28,.18)] sm:p-7">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-gold-200">
              Booking summary
            </p>
            {firstSlot && lastSlot ? (
              <p className="mt-2 font-display text-xl font-semibold">
                {manilaTimeFormatter.format(new Date(firstSlot.starts_at))}–
                {manilaTimeFormatter.format(new Date(lastSlot.ends_at))} · {duration}{" "}
                {duration === 1 ? "hour" : "hours"}
              </p>
            ) : (
              <p className="mt-2 text-sm text-white/65">Choose at least one hour.</p>
            )}
          </div>
          <p className="font-display text-4xl font-bold text-gold-200">
            {formatPeso(total)}
          </p>
        </div>

        {firstSlot ? (
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
            <div>
              <dt className="text-white/55">Court fee</dt>
              <dd className="mt-1 font-semibold">{formatPeso(courtFee)}</dd>
            </div>
            <div>
              <dt className="text-white/55">Paddles</dt>
              <dd className="mt-1 font-semibold">{formatPeso(paddleFee)}</dd>
            </div>
          </dl>
        ) : null}

        {state.error ? (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-300/35 bg-red-950/40 px-3 py-2.5 text-sm text-red-100"
          >
            {state.error}
          </p>
        ) : null}

        {!paymentConfigured ? (
          <p className="mt-5 rounded-xl border border-gold-200/35 bg-gold-500/10 px-3 py-2.5 text-sm text-gold-200">
            Online booking is not accepting payments yet because Tiffany&apos;s
            GCash details have not been configured.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!firstSlot || pending || !paymentConfigured}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-gold-500 px-5 font-bold text-court-950 transition hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Holding your court…" : "Hold court for 30 minutes"}
        </button>
        <p className="mt-3 text-center text-xs text-white/55">
          Your selected time becomes unavailable to others during the payment hold.
        </p>
      </section>
    </form>
  );
}
