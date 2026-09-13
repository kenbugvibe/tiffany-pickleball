export default function HomePage() {
  return (
    <main className="min-h-screen bg-cream-50">
      <header className="border-b border-white/10 bg-court-950 text-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-3 px-5 py-3 sm:px-8">
          <div
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-full border border-gold-200/40 bg-court-800 font-mono text-xs font-semibold text-gold-200"
          >
            TP
          </div>
          <div>
            <p className="font-display text-lg font-bold leading-none text-gold-200">
              Tiffany&apos;s Pickleball Court
            </p>
            <p className="mt-1 text-xs text-white/60">Panabo City</p>
          </div>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl place-items-center px-5 py-16 sm:px-8">
        <div className="max-w-2xl text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-court-700">
            Indoor pickleball courts
          </p>
          <h1 className="mt-4 font-display text-5xl font-bold leading-[0.95] text-ink-900 sm:text-7xl">
            Your next game starts here.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-ink-500 sm:text-lg">
            The customer booking experience is being connected to live court
            availability.
          </p>
          <div className="mx-auto mt-9 flex min-h-12 w-fit items-center rounded-full bg-court-950 px-6 font-semibold text-gold-200 shadow-[0_14px_40px_rgba(7,52,28,0.18)]">
            Phase 2 in progress
          </div>
        </div>
      </section>
    </main>
  );
}
