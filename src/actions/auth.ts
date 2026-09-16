"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthFormState } from "@/lib/auth-form-state";
import { ensureCustomerProfile } from "@/lib/data/customers";
import { createClient } from "@/lib/supabase/server";
import {
  normalizePhPhone,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
  type FieldErrors,
} from "@/lib/validation";

function failure(
  fieldErrors: FieldErrors,
  formError: string | null = null,
): AuthFormState {
  return { formError, fieldErrors, notice: null };
}

/**
 * Only same-origin paths are accepted so a crafted `next` value cannot bounce
 * a signed-in customer to another site.
 */
function safeRedirectTarget(raw: FormDataEntryValue | null) {
  const value = typeof raw === "string" ? raw : "";

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/";
}

async function getOrigin() {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";

  return `${protocol}://${host}`;
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fullName = String(formData.get("fullName") ?? "");
  const email = String(formData.get("email") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");

  const fieldErrors: FieldErrors = {};
  const nameError = validateFullName(fullName);
  const emailError = validateEmail(email);
  const phoneError = validatePhone(phone);
  const passwordError = validatePassword(password);

  if (nameError) fieldErrors.fullName = nameError;
  if (emailError) fieldErrors.email = emailError;
  if (phoneError) fieldErrors.phone = phoneError;
  if (passwordError) fieldErrors.password = passwordError;

  if (Object.keys(fieldErrors).length > 0) {
    return failure(fieldErrors);
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  const target = safeRedirectTarget(formData.get("next"));

  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(target)}`,
      data: {
        full_name: fullName.trim(),
        phone: normalizePhPhone(phone),
      },
    },
  });

  if (error) {
    return failure({}, error.message);
  }

  return {
    formError: null,
    fieldErrors: {},
    notice:
      "Check your email and open the confirmation link to finish creating your account.",
  };
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const fieldErrors: FieldErrors = {};
  const emailError = validateEmail(email);

  if (emailError) fieldErrors.email = emailError;
  if (!password) fieldErrors.password = "Enter your password.";

  if (Object.keys(fieldErrors).length > 0) {
    return failure(fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    // Deliberately vague: a precise message would reveal which emails exist.
    return failure({}, "That email and password combination did not work.");
  }

  await ensureCustomerProfile();

  redirect(safeRedirectTarget(formData.get("next")));
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/");
}

export async function requestPasswordResetAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const emailError = validateEmail(email);

  if (emailError) {
    return failure({ email: emailError });
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent("/update-password")}`,
  });

  // The same notice shows whether or not the address exists, so this cannot be
  // used to discover which emails have accounts.
  return {
    formError: null,
    fieldErrors: {},
    notice:
      "If that email has an account, a password reset link is on its way.",
  };
}

export async function updatePasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: FieldErrors = {};
  const passwordError = validatePassword(password);

  if (passwordError) fieldErrors.password = passwordError;
  if (password !== confirmPassword) {
    fieldErrors.confirmPassword = "Both passwords must match.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return failure(fieldErrors);
  }

  const supabase = await createClient();

  // Server Functions are reachable by direct POST, so the session is verified
  // here rather than relying on the page having redirected already.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return failure(
      {},
      "That reset link has expired. Request a new one to continue.",
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return failure({}, error.message);
  }

  await ensureCustomerProfile();

  redirect("/");
}
