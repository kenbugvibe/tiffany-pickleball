export type BookingActionState = {
  error: string | null;
};

export const emptyBookingActionState: BookingActionState = {
  error: null,
};

/** Mirrors the database limits in 202610070022_security_hardening.sql. */
export const MAX_PADDLES = 8;
export const MAX_DAYS_AHEAD = 60;
