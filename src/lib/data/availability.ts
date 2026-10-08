import "server-only";

import { MAX_DAYS_AHEAD } from "@/lib/booking-form-state";
import { createClient } from "@/lib/supabase/server";

export type AvailabilityStatus =
  | "available"
  | "booked"
  | "blocked"
  | "open_play"
  | "sunday_unli"
  /** Start time has passed (set by markUnbookableSlots, not the database). */
  | "past"
  /** Beyond the booking window (set by markUnbookableSlots). */
  | "not_open";

export type AvailabilityRow = {
  court_id: number;
  court_name: string;
  starts_at: string;
  ends_at: string;
  court_price: number;
  availability_status: AvailabilityStatus;
  entry_id: string | null;
  entry_price: number | null;
};

/**
 * Loads availability for consecutive days in one database call.
 * `days` must be sorted and consecutive (a single day or a week).
 */
export async function getAvailabilityForDays(days: string[]) {
  const byDay: Record<string, AvailabilityRow[]> = Object.fromEntries(
    days.map((day) => [day, [] as AvailabilityRow[]]),
  );

  if (days.length === 0) return byDay;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_court_availability_range", {
    p_from: days[0],
    p_days: days.length,
  });

  if (error) {
    throw new Error("Could not load court availability.");
  }

  for (const row of (data ?? []) as Array<AvailabilityRow & { day: string }>) {
    const { day, ...availability } = row;
    byDay[day]?.push(availability);
  }

  return byDay;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hides slots customers cannot actually book: open court hours that already
 * started, events that already ended, and court hours beyond the
 * MAX_DAYS_AHEAD booking window (the database enforces the same limit).
 */
export function markUnbookableSlots(
  rows: AvailabilityRow[],
  now = Date.now(),
): AvailabilityRow[] {
  const lastBookableStart = now + MAX_DAYS_AHEAD * DAY_MS;

  return rows.map((row) => {
    const startsAt = Date.parse(row.starts_at);
    const endsAt = Date.parse(row.ends_at);

    if (row.availability_status === "available") {
      if (startsAt <= now) return { ...row, availability_status: "past" };
      if (startsAt > lastBookableStart) {
        return { ...row, availability_status: "not_open" };
      }
    }

    if (
      (row.availability_status === "open_play" ||
        row.availability_status === "sunday_unli") &&
      endsAt <= now
    ) {
      return { ...row, availability_status: "past" };
    }

    return row;
  });
}
