export const MIN_PASSWORD_LENGTH = 8;

export type FieldErrors = Record<string, string>;

/**
 * Normalizes Philippine mobile input to one of the two forms the
 * `customer_phone_present` database constraint accepts: `09XXXXXXXXX`
 * or `+639XXXXXXXXX`. Returns null when the number cannot be normalized.
 */
export function normalizePhPhone(raw: string): string | null {
  const compact = raw.replace(/[\s()-]/g, "");

  if (/^09\d{9}$/.test(compact)) {
    return compact;
  }

  if (/^\+639\d{9}$/.test(compact)) {
    return compact;
  }

  if (/^639\d{9}$/.test(compact)) {
    return `+${compact}`;
  }

  if (/^9\d{9}$/.test(compact)) {
    return `0${compact}`;
  }

  return null;
}

export function validateFullName(raw: string): string | null {
  if (raw.trim().length < 2) {
    return "Enter your full name.";
  }

  return null;
}

export function validateEmail(raw: string): string | null {
  const value = raw.trim();

  if (!value) {
    return "Enter your email address.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Enter a valid email address.";
  }

  return null;
}

export function validatePassword(raw: string): string | null {
  if (raw.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return null;
}

export function validatePhone(raw: string): string | null {
  if (!raw.trim()) {
    return "Enter your mobile number.";
  }

  if (!normalizePhPhone(raw)) {
    return "Use a Philippine mobile number, for example 09171234567.";
  }

  return null;
}
