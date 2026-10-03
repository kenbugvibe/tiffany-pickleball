"use client";

import { useRef, useState } from "react";

import { rescheduleBookingAction } from "@/actions/owner";
import { isIsoDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";

type AvailabilityRow = {
  court_id: number;
  starts_at: string;
  availability_status: string;
};

type RescheduleBookingFormProps = {
  booking: {
    id: string;
    courtId: number;
    startsAt: string;
    endsAt: string;
  };
  courts: Array<{ id: number; name: string }>;
  selectedDay: string;
  today: string;
  openingHour: number;
  closingHour: number;
  nowIso: string;
};

const HOUR_MS = 60 * 60 * 1000;

function hourLabel(hour: number) {
  if (hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";

  return `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? "PM" : "AM"}`;
}

function manilaDayStart(date: string) {
  return new Date(`${date}T00:00:00+08:00`).getTime();
}

export function RescheduleBookingForm({
  booking,
  courts,
  selectedDay,
  today,
  openingHour,
  closingHour,
  nowIso,
}: RescheduleBookingFormProps) {
  const bookingStart = new Date(booking.startsAt).getTime();
  const bookingEnd = new Date(booking.endsAt).getTime();
  const durationHours = Math.round((bookingEnd - bookingStart) / HOUR_MS);
  const [date, setDate] = useState(selectedDay);
  const [rows, setRows] = useState<AvailabilityRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [choice, setChoice] = useState<{
    courtId: number;
    startHour: number;
  } | null>(null);
  const latestRequest = useRef(0);

  async function loadAvailability(day: string) {
    const request = ++latestRequest.current;
    setRows(null);
    setLoadError(false);
    setChoice(null);

    const { data, error } = await createClient().rpc(
      "get_court_availability",
      { p_day: day },
    );

    if (request !== latestRequest.current) return;

    if (error) {
      setLoadError(true);
      return;
    }

    setRows((data ?? []) as AvailabilityRow[]);
  }

  const dayStart = manilaDayStart(date);
  const occupied = new Set<string>();

  for (const row of rows ?? []) {
    const startsAt = new Date(row.starts_at).getTime();
    const isOwnSlot =
      row.court_id === booking.courtId &&
      startsAt >= bookingStart &&
      startsAt < bookingEnd;

    if (row.availability_status !== "available" && !isOwnSlot) {
      occupied.add(`${row.court_id}-${Math.round((startsAt - dayStart) / HOUR_MS)}`);
    }
  }

  const startHours = Array.from(
    { length: Math.max(0, closingHour - durationHours - openingHour + 1) },
    (_, index) => openingHour + index,
  );
  const now = new Date(nowIso).getTime();

  function slotState(courtId: number, startHour: number) {
    const startsAt = dayStart + startHour * HOUR_MS;

    if (courtId === booking.courtId && startsAt === bookingStart) {
      return "current" as const;
    }

    if (startsAt <= now) return "past" as const;

    for (let offset = 0; offset < durationHours; offset += 1) {
      if (occupied.has(`${courtId}-${startHour + offset}`)) {
        return "taken" as const;
      }
    }

    return "free" as const;
  }

  return (
    <details
      className="group sm:text-right"
      onToggle={(event) => {
        if (event.currentTarget.open && rows === null && !loadError) {
          void loadAvailability(date);
        }
      }}
    >
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center justify-center rounded-lg border border-court-800/20 px-3 text-xs font-bold text-court-700 transition hover:bg-court-700/5">
        Reschedule
      </summary>
      <form
        action={rescheduleBookingAction}
        className="mt-3 grid gap-3 rounded-lg border border-court-800/10 bg-cream-50 p-3 text-left"
      >
        <input type="hidden" name="bookingId" value={booking.id} />
        <input type="hidden" name="returnDate" value={selectedDay} />
        <input type="hidden" name="courtId" value={choice?.courtId ?? ""} />
        <input type="hidden" name="startHour" value={choice?.startHour ?? ""} />

        <label className="grid gap-1 text-xs font-bold text-ink-900">
          Date
          <input
            type="date"
            name="newDate"
            min={today}
            value={date}
            required
            onChange={(event) => {
              const nextDate = event.target.value;
              setDate(nextDate);

              if (isIsoDate(nextDate)) {
                void loadAvailability(nextDate);
              }
            }}
            className="min-h-10 rounded-lg border border-court-800/20 bg-white px-2 font-normal outline-none focus:border-court-700"
          />
        </label>

        <div className="grid gap-2">
          <p className="text-xs font-bold text-ink-900">
            Free {durationHours}-hour slots
          </p>
          {loadError ? (
            <p className="text-xs text-red-700">
              Availability could not be loaded.{" "}
              <button
                type="button"
                onClick={() => void loadAvailability(date)}
                className="font-bold underline"
              >
                Try again
              </button>
            </p>
          ) : rows === null ? (
            <p className="text-xs text-ink-500">Loading availability…</p>
          ) : (
            courts.map((court) => (
              <div key={court.id}>
                <p className="text-[11px] font-semibold text-ink-500">
                  {court.name}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {startHours.map((hour) => {
                    const state = slotState(court.id, hour);
                    const selected =
                      choice?.courtId === court.id &&
                      choice.startHour === hour;

                    return (
                      <button
                        key={hour}
                        type="button"
                        disabled={state !== "free"}
                        aria-pressed={selected}
                        title={
                          state === "current"
                            ? "Current time"
                            : state === "taken"
                              ? "Not available"
                              : undefined
                        }
                        onClick={() =>
                          setChoice({ courtId: court.id, startHour: hour })
                        }
                        className={`min-h-8 rounded-md border px-2 font-mono text-[11px] font-bold transition ${
                          selected
                            ? "border-court-700 bg-court-700 text-white"
                            : state === "free"
                              ? "border-court-800/20 bg-white text-ink-900 hover:border-court-700"
                              : state === "current"
                                ? "cursor-not-allowed border-amber-300 bg-amber-50 text-amber-900"
                                : "cursor-not-allowed border-transparent bg-[#edeae1] text-ink-500/50 line-through"
                        }`}
                      >
                        {hourLabel(hour)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <label className="grid gap-1 text-xs font-bold text-ink-900">
          Note to customer (optional)
          <input
            type="text"
            name="note"
            maxLength={240}
            placeholder="e.g. Moved as discussed by phone"
            className="min-h-10 rounded-lg border border-court-800/20 bg-white px-2 font-normal outline-none focus:border-court-700"
          />
        </label>
        <p className="text-[11px] leading-5 text-ink-500">
          {choice
            ? `New time: ${courts.find((court) => court.id === choice.courtId)?.name ?? "Court"}, ${hourLabel(choice.startHour)} - ${hourLabel(choice.startHour + durationHours)}. `
            : "Pick a free start time above. "}
          The price stays the same and the customer is emailed the new
          schedule.
        </p>
        <button
          type="submit"
          disabled={!choice}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-court-700 px-3 text-xs font-bold text-white transition hover:bg-court-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Move booking
        </button>
      </form>
    </details>
  );
}
