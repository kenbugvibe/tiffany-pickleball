const INTERNAL_URL_BASE = "https://internal.invalid";
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * Accepts only a path on this application. URL parsing catches protocol-relative
 * and backslash-based URLs that a simple `startsWith("/")` check can miss.
 */
export function safeRedirectPath(raw: unknown, fallback = "/") {
  if (
    typeof raw !== "string" ||
    !raw.startsWith("/") ||
    raw.includes("\\") ||
    CONTROL_CHARACTER.test(raw)
  ) {
    return fallback;
  }

  try {
    const url = new URL(raw, INTERNAL_URL_BASE);

    if (url.origin !== INTERNAL_URL_BASE) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
