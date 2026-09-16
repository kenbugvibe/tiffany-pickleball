import type { FieldErrors } from "@/lib/validation";

export type AuthFormState = {
  formError: string | null;
  fieldErrors: FieldErrors;
  notice: string | null;
};

/**
 * Kept out of `src/actions/auth.ts`: a `"use server"` module may only export
 * async functions, so a plain object there breaks every client import of it.
 */
export const emptyAuthState: AuthFormState = {
  formError: null,
  fieldErrors: {},
  notice: null,
};
