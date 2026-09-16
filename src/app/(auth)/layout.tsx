import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-screen bg-court-950">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="mb-7 flex items-center gap-3 self-start"
          aria-label="Tiffany's Pickleball Court home"
        >
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-full border border-gold-200/40 bg-court-800 font-mono text-xs font-semibold text-gold-200"
          >
            TP
          </span>
          <span>
            <span className="block font-display text-base font-bold leading-none tracking-wide text-gold-200">
              TIFFANY&apos;S
            </span>
            <span className="mt-1 block text-[9px] font-semibold tracking-[0.18em] text-white/55">
              PICKLEBALL COURT
            </span>
          </span>
        </Link>

        <div className="rounded-2xl bg-cream-50 p-6 shadow-[0_18px_50px_rgba(0,0,0,.28)] sm:p-8">
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-white/45">
          Court availability stays public — you only sign in to reserve.
        </p>
      </div>
    </main>
  );
}
