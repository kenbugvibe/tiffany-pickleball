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

export async function getAvailabilityForDays(days: string[]) {
  const supabase = await createClient();

  const results = await Promise.all(
    days.map(async (day) => {
      const { data, error } = await supabase.rpc("get_court_availability", {
        p_day: day,
      });

      if (error) {
        throw new Error(`Could not load court availability for ${day}.`);
      }

      return [day, (data ?? []) as AvailabilityRow[]] as const;
    }),
  );

  return Object.fromEntries(results) as Record<string, AvailabilityRow[]>;
}
