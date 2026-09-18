import { addDaysToIsoDate, isIsoDate } from "@/lib/dates";

export type CourtBlockSelection = {
  courtIds: number[];
  date: string;
  startHour: number;
  endHour: number;
  reason: string;
};

type CourtBlockInput = {
  courtIds?: string[];
  date?: string;
  startHour?: string;
  endHour?: string;
  reason?: string;
};

export type CourtBlockParseResult =
  | { ok: true; value: CourtBlockSelection }
  | { ok: false; error: string };

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCourtBlockSelection(
  input: CourtBlockInput,
): CourtBlockParseResult {
  const submittedCourtIds = input.courtIds ?? [];
  const parsedCourtIds = submittedCourtIds.map(Number);
  const courtIds = Array.from(new Set(parsedCourtIds)).sort(
    (first, second) => first - second,
  );
  const startHour = Number(input.startHour);
  const endHour = Number(input.endHour);
  const reason = input.reason?.trim() ?? "";

  if (
    courtIds.length < 1 ||
    courtIds.length > 3 ||
    parsedCourtIds.some((courtId) => !Number.isInteger(courtId)) ||
    courtIds.some((courtId) => courtId < 1 || courtId > 32767)
  ) {
    return { ok: false, error: "Choose one, two, or all three courts." };
  }

  if (!isIsoDate(input.date)) {
    return { ok: false, error: "Choose a valid date." };
  }

  if (
    !Number.isInteger(startHour) ||
    !Number.isInteger(endHour) ||
    startHour < 8 ||
    startHour > 23 ||
    endHour < 9 ||
    endHour > 24 ||
    endHour <= startHour
  ) {
    return {
      ok: false,
      error: "Choose a whole-hour period between 8:00 AM and midnight.",
    };
  }

  if (reason.length < 3 || reason.length > 240) {
    return {
      ok: false,
      error: "Enter a reason between 3 and 240 characters.",
    };
  }

  return {
    ok: true,
    value: {
      courtIds,
      date: input.date,
      startHour,
      endHour,
      reason,
    },
  };
}

export function manilaHourToIso(date: string, hour: number) {
  const normalizedDate = hour === 24 ? addDaysToIsoDate(date, 1) : date;
  const normalizedHour = hour === 24 ? 0 : hour;
  const localTimestamp = `${normalizedDate}T${String(normalizedHour).padStart(2, "0")}:00:00+08:00`;

  return new Date(localTimestamp).toISOString();
}

export function courtBlockReturnPath(date: string) {
  return `/owner/calendar?week=${encodeURIComponent(date)}&day=${encodeURIComponent(date)}`;
}
