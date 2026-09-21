import Link from "next/link";

export function OpenPlayShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-cream-50">
      <header className="border-b border-white/10 bg-court-950 text-white">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-full border border-gold-200/40 bg-court-800 font-mono text-xs font-semibold text-gold-200"
            >
              TP
            </span>
            <span className="font-display font-bold text-gold-200">
              TIFFANY&apos;S
            </span>
          </Link>
          <Link
            href="/#availability"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-white/75 hover:text-white"
          >
            Back to availability
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        {children}
      </div>
    </main>
  );
}
