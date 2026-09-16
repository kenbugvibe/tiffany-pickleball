import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Money",
};

export default function OwnerMoneyPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-court-700">
        Financial records
      </p>
      <h1 className="mt-2 font-display text-4xl font-bold text-ink-900">
        Money
      </h1>
      <div className="mt-7 rounded-2xl border border-court-800/10 bg-white px-6 py-12 text-center">
        <p className="font-display text-2xl font-semibold text-ink-900">
          Reporting comes after calendar operations
        </p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-500">
          Booking records, filters, revenue summaries, refunds, and CSV export will live here in the approved Money phase.
        </p>
      </div>
    </div>
  );
}
