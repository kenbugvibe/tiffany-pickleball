"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthFormState } from "@/lib/auth-form-state";
import { ensureCustomerProfile } from "@/lib/data/customers";
import { safeRedirectPath } from "@/lib/redirects";
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

function httpOrigin(raw: string | undefined) {
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

async function getOrigin() {
  const configuredOrigin = httpOrigin(process.env.SITE_URL);

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const vercelOrigin = httpOrigin(process.env.VERCEL_URL);

  if (vercelOrigin) {
    return vercelOrigin;
  }

  const headerList = await headers();
  const requestOrigin = httpOrigin(headerList.get("origin") ?? undefined);

  if (requestOrigin) {
    return requestOrigin;
  }

  const host = headerList.get("host") ?? "localhost:3000";
  const forwardedProtocol = headerList
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";

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
  const target = safeRedirectPath(formData.get("next"));

  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(target)}`,
      data: {
        // `handle_new_customer()` on auth.users only creates the profile row
        // when this marker is present, so owner accounts are never given one.
        account_type: "customer",
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

  const { data: isAdmin } = await supabase.rpc("is_admin");

  if (isAdmin) {
    redirect("/owner/today");
  }

  const customerId = await ensureCustomerProfile();

  if (!customerId) {
    const next = safeRedirectPath(formData.get("next"));
    redirect(`/complete-profile?next=${encodeURIComponent(next)}`);
  }

  redirect(safeRedirectPath(formData.get("next")));
}

export async function signInWithOAuthAction(formData: FormData) {
  const providerValue = String(formData.get("provider") ?? "");
  const next = safeRedirectPath(formData.get("next"));
  const authPage =
    formData.get("authPage") === "sign-up" ? "/sign-up" : "/sign-in";
  const errorPath = `${authPage}?error=oauth-failed&next=${encodeURIComponent(next)}`;

  if (providerValue !== "google" && providerValue !== "facebook") {
    redirect(errorPath);
  }

  const origin = await getOrigin();
  const callbackUrl = new URL("/auth/confirm", origin);
  callbackUrl.searchParams.set("flow", "oauth");
  callbackUrl.searchParams.set("next", next);
  callbackUrl.searchParams.set("provider", providerValue);
  callbackUrl.searchParams.set(
    "authPage",
    authPage === "/sign-up" ? "sign-up" : "sign-in",
  );

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: providerValue,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    redirect(errorPath);
  }

  redirect(data.url);
}

export async function completeCustomerProfileAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fullName = String(formData.get("fullName") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const next = safeRedirectPath(formData.get("next"));
  const fieldErrors: FieldErrors = {};
  const nameError = validateFullName(fullName);
  const phoneError = validatePhone(phone);

  if (nameError) fieldErrors.fullName = nameError;
  if (phoneError) fieldErrors.phone = phoneError;

  if (Object.keys(fieldErrors).length > 0) {
    return failure(fieldErrors);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  if (!user.email) {
    return failure(
      {},
      "Your Google or Facebook account did not share an email address. Sign out and allow email access before trying again.",
    );
  }

  const [{ data: isAdmin }, { data: existingCustomer }] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase
      .from("customers")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
  ]);

  if (isAdmin) {
    redirect("/owner/today");
  }

  if (existingCustomer) {
    redirect(next);
  }

  const normalizedPhone = normalizePhPhone(phone);

  if (!normalizedPhone) {
    return failure({ phone: "Enter a valid Philippine mobile number." });
  }

  const { error: profileError } = await supabase.from("customers").insert({
    auth_user_id: user.id,
    full_name: fullName.trim(),
    phone: normalizedPhone,
    email: user.email.toLowerCase(),
    is_coach: false,
  });

  if (profileError) {
    return failure(
      {},
      "Your customer profile could not be saved. Please try again.",
    );
  }

  // Keep the normalized customer fields in Auth metadata as a repair fallback.
  await supabase.auth.updateUser({
    data: {
      account_type: "customer",
      full_name: fullName.trim(),
      phone: normalizedPhone,
    },
  });

  redirect(next);
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
