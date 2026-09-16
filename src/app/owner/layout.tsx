import type { Metadata } from "next";
import Link from "next/link";

import { signOutAction } from "@/actions/auth";
import { OwnerNav } from "@/components/owner/owner-nav";
import { requireOwner } from "@/lib/owner-auth";

export const metadata: Metadata = {
  title: {
    default: "Owner console",
    template: "%s | Owner console",
  },
};

export default async function OwnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const owner = await requireOwner();

  return (
    <main className="min-h-screen bg-cream-50">
      <header className="border-b border-white/10 bg-court-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link href="/owner/today" className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-10 place-items-center rounded-full border border-gold-200/40 bg-court-800 font-mono text-xs font-semibold text-gold-200"
              >
                TP
              </span>
              <span>
                <span className="block font-display text-lg font-bold leading-none text-gold-200">
                  TIFFANY&apos;S
                </span>
                <span className="mt-1 block text-[9px] font-bold tracking-[0.18em] text-white/50">
                  OWNER CONSOLE
                </span>
              </span>
            </Link>

            <form action={signOutAction} className="lg:hidden">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-3 text-sm font-semibold"
              >
                Sign out
              </button>
            </form>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <OwnerNav />
            <div className="hidden items-center gap-3 border-l border-white/15 pl-4 lg:flex">
              <span className="max-w-48 truncate text-xs text-white/50">
                {owner.email}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-3 text-sm font-semibold transition hover:bg-white/10"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {children}
    </main>
  );
}
