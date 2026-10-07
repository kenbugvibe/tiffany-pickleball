import "server-only";

import { createClient } from "@/lib/supabase/server";

export type AvailabilityStatus =
  | "available"
  | "booked"
  | "blocked"
  | "open_play"
  | "sunday_unli";

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
