import Link from "next/link";

import { signOutAction } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";

const linkClass =
  "text-sm font-medium text-white/75 transition hover:text-white";

export async function SiteNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: isAdmin }, { data: customerId }] = user
    ? await Promise.all([
        supabase.rpc("is_admin"),
        supabase.rpc("current_customer_id"),
      ])
    : [{ data: false }, { data: null }];

  return (
    <nav
      className="flex items-center gap-2 sm:gap-6"
      aria-label="Main navigation"
    >
      <Link href="/#availability" className={`hidden sm:block ${linkClass}`}>
        Availability
      </Link>

      {user ? (
        <>
          {customerId ? (
            <Link href="/my-bookings" className={linkClass}>
              My bookings
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              href="/owner/today"
              className="inline-flex min-h-11 items-center rounded-xl bg-gold-500 px-4 text-sm font-bold text-court-950 transition hover:bg-gold-200"
            >
              Owner console
            </Link>
          ) : null}
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-xl border border-white/25 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
        </>
      ) : (
        <Link
          href="/sign-in"
          prefetch={false}
          className="inline-flex min-h-11 items-center rounded-xl bg-gold-500 px-4 text-sm font-bold text-court-950 transition hover:bg-gold-200"
        >
          Sign in
        </Link>
      )}
    </nav>
  );
}
