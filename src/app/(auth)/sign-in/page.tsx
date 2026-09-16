import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/shared/sign-in-form";
import { safeRedirectPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
};

type SignInPageProps = {
  searchParams: Promise<{ next?: string | string[]; error?: string }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const next = safeRedirectPath(firstValue(params.next));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(next);
  }

  const notice =
    params.error === "confirmation-failed"
      ? "That confirmation link is invalid or has expired. Sign in, or create the account again."
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
