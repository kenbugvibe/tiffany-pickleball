import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/actions/auth";
import { CompleteProfileForm } from "@/components/shared/complete-profile-form";
import { safeRedirectPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Complete your profile",
};

type CompleteProfilePageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function CompleteProfilePage({
  searchParams,
}: CompleteProfilePageProps) {
  const rawNext = (await searchParams).next;
  const next = safeRedirectPath(
    Array.isArray(rawNext) ? rawNext[0] : rawNext,
  );
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  const [{ data: customerId }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("current_customer_id"),
    supabase.rpc("is_admin"),
  ]);

  if (isAdmin) {
    redirect("/owner/today");
  }

  if (customerId) {
    redirect(next);
  }

  const metadata = user.user_metadata ?? {};
  const defaultName = String(
    metadata.full_name ?? metadata.name ?? "",
  ).trim();

  return (
    <>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-court-700">
        One last step
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold text-ink-900">
        Complete your profile
      </h1>
      <p className="mt-2 text-sm leading-6 text-ink-500">
        Your social account is connected. Add the contact details Tiffany needs
        before you make a reservation.
      </p>

      {user.email ? (
        <div className="mt-6">
          <CompleteProfileForm next={next} defaultName={defaultName} />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700"
          >
            Your social account did not share an email address. Sign out, allow
            email access, and try again.
          </p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-court-800 px-5 font-bold text-white transition hover:bg-court-700"
            >
              Sign out and try again
            </button>
          </form>
        </div>
      )}
    </>
  );
}
