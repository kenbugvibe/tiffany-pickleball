import { addDaysToIsoDate, isIsoDate } from "@/lib/dates";

export function isSundayIsoDate(value: string | undefined): value is string {
  return (
    isIsoDate(value) && new Date(`${value}T12:00:00Z`).getUTCDay() === 0
  );
}

export function getNextSunday(value: string) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  const daysUntilSunday = (7 - day) % 7;

  return addDaysToIsoDate(value, daysUntilSunday);
}

export function sundayUnliReturnPath(date: string) {
  const params = new URLSearchParams({ week: date, day: date });
  return `/owner/calendar?${params.toString()}`;
}
