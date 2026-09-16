import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/shared/sign-up-form";
import { safeRedirectPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Create account",
};

type SignUpPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const rawNext = (await searchParams).next;
  const next = safeRedirectPath(
    Array.isArray(rawNext) ? rawNext[0] : rawNext,
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(next);
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink-900">
        Create your account
      </h1>
      <p className="mt-1.5 text-sm text-ink-500">
        You need an account before reserving a court.
      </p>

      <div className="mt-6">
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
