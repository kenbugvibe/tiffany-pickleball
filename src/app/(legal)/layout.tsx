import Link from "next/link";

import { BrandMark } from "@/components/shared/brand-mark";
import { COURT_ADDRESS_FULL } from "@/components/shared/court-location";

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-screen bg-cream-50">
      <header className="border-b border-white/10 bg-court-950 text-white">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="Tiffany's Pickleball Court home"
          >
            <BrandMark />
            <span>
              <span className="block font-display text-base font-bold leading-none tracking-wide text-gold-200 sm:text-lg">
                TIFFANY&apos;S
              </span>
              <span className="mt-1 block text-[9px] font-semibold tracking-[0.18em] text-white/55">
                PICKLEBALL COURT
              </span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-white/75 hover:text-white"
          >
            Back to home
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-10 text-base leading-7 text-ink-900 sm:px-8 sm:py-14 [&_h1]:font-display [&_h1]:text-4xl [&_h1]:font-bold [&_h1]:tracking-[-0.01em] [&_h1]:text-ink-900 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink-900 [&_li]:mt-2 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </article>

      <footer className="border-t border-court-800/10 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-7 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="font-display font-semibold text-ink-900">
            Tiffany&apos;s Pickleball Court
          </p>
          <p>{COURT_ADDRESS_FULL}</p>
        </div>
      </footer>
    </main>
  );
}
