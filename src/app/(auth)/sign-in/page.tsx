import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/shared/sign-in-form";
import { SocialAuthButtons } from "@/components/shared/social-auth-buttons";
import { safeRedirectPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
};

type SignInPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const next = safeRedirectPath(firstValue(params.next));
  const error = firstValue(params.error);

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

  const notice =
    error === "confirmation-failed"
      ? "That confirmation link is invalid or has expired. Sign in, or create the account again."
      : null;
  const oauthError =
    error === "owner-social-unlinked"
      ? "That social login was disconnected from the owner. Move the owner account to a dedicated email, then try this social account again to create a customer account."
      : error === "owner-social-conflict"
        ? "That social account uses the owner's email and cannot become a separate customer account. Enable Manual Linking in Supabase so it can be disconnected, or use a different social email."
      : error === "oauth-failed"
        ? "Google or Facebook sign-in could not be completed. Please try again."
        : null;

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink-900">
        Sign in
      </h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Sign in to reserve a court or join open play.
      </p>

      <div className="mt-6">
        <SocialAuthButtons
          next={next}
          authPage="sign-in"
          error={oauthError}
          emailLabel="or sign in with email"
        />
        <SignInForm next={next} notice={notice} />
      </div>

      <p className="mt-4 text-sm">
        <Link
          href="/forgot-password"
          className="font-semibold text-court-800 underline underline-offset-2 hover:text-court-700"
        >
          Forgot your password?
        </Link>
      </p>

      <p className="mt-6 text-sm text-ink-500">
        No account yet?{" "}
        <Link
          href={`/sign-up?next=${encodeURIComponent(next)}`}
          className="font-semibold text-court-800 underline underline-offset-2 hover:text-court-700"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
