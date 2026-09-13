"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-cream-50 px-5">
      <div className="max-w-md rounded-2xl border border-court-800/10 bg-white p-8 text-center shadow-[0_12px_38px_rgba(7,52,28,0.08)]">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-court-700">
          Schedule unavailable
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink-900">
          We couldn&apos;t load the courts.
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-500">
          Check your connection and try loading the live schedule again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-12 rounded-xl bg-court-800 px-6 font-bold text-gold-200 transition hover:bg-court-700"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
