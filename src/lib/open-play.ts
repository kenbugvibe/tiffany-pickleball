import { manilaHourToIso } from "@/lib/court-blocks";
import { isIsoDate } from "@/lib/dates";

export type OpenPlaySelection = {
  courtId: number;
  date: string;
  startHour: number;
  endHour: number;
  title: string;
  customerNote: string;
};

type OpenPlayInput = {
  courtId?: string;
  date?: string;
  startHour?: string;
  endHour?: string;
  title?: string;
  customerNote?: string;
};

export type OpenPlayParseResult =
  | { ok: true; value: OpenPlaySelection }
  | { ok: false; error: string };

export function parseOpenPlaySelection(
  input: OpenPlayInput,
): OpenPlayParseResult {
  const courtId = Number(input.courtId);
  const startHour = Number(input.startHour);
  const endHour = Number(input.endHour);
  const title = input.title?.trim() ?? "";
  const customerNote = input.customerNote?.trim() ?? "";

  if (!Number.isInteger(courtId) || courtId < 1 || courtId > 32767) {
    return { ok: false, error: "Choose a valid court." };
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

  if (title.length < 3 || title.length > 80) {
    return {
      ok: false,
      error: "Enter a title between 3 and 80 characters.",
    };
  }

  if (customerNote.length > 500) {
    return {
      ok: false,
      error: "Keep the customer note to 500 characters or fewer.",
    };
  }

  return {
    ok: true,
    value: {
      courtId,
      date: input.date,
      startHour,
      endHour,
      title,
      customerNote,
    },
  };
}

export function openPlayTimes(selection: OpenPlaySelection) {
  return {
    startsAt: manilaHourToIso(selection.date, selection.startHour),
    endsAt: manilaHourToIso(selection.date, selection.endHour),
  };
}

export function openPlayReturnPath(date: string) {
  return `/owner/calendar?week=${encodeURIComponent(date)}&day=${encodeURIComponent(date)}`;
}
