import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/shared/sign-up-form";
import { SocialAuthButtons } from "@/components/shared/social-auth-buttons";
import { safeRedirectPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Create account",
};

type SignUpPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const rawNext = params.next;
  const next = safeRedirectPath(
    Array.isArray(rawNext) ? rawNext[0] : rawNext,
  );
  const rawError = params.error;
  const error = Array.isArray(rawError) ? rawError[0] : rawError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const [{ data: customerId }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("current_customer_id"),
      supabase.rpc("is_admin"),
    ]);

    if (isAdmin) {
      redirect("/owner/today");
    }

    redirect(
      customerId
        ? next
        : `/complete-profile?next=${encodeURIComponent(next)}`,
    );
  }

  const oauthError =
    error === "owner-social-unlinked"
      ? "That social login was disconnected from the owner. Move the owner account to a dedicated email, then try this social account again to create a customer account."
      : error === "owner-social-conflict"
        ? "That social account uses the owner's email and cannot become a separate customer account. Enable Manual Linking in Supabase so it can be disconnected, or use a different social email."
      : error === "oauth-failed"
        ? "Google or Facebook account creation could not be completed. Please try again."
        : null;

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink-900">
        Create your account
      </h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Continue with Google or Facebook, or create an account with email.
      </p>

      <div className="mt-6">
        <SocialAuthButtons
          next={next}
          authPage="sign-up"
          error={oauthError}
          emailLabel="or create with email"
        />
        <SignUpForm next={next} />
      </div>

      <p className="mt-6 text-sm text-ink-500">
        Already have one?{" "}
        <Link
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className="font-semibold text-court-800 underline underline-offset-2 hover:text-court-700"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
