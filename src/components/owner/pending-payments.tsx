import { ReviewButtons } from "@/components/owner/review-buttons";
import type { OwnerPendingPayment } from "@/lib/data/owner";
import { manilaScheduleFormatter } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export function PendingPayments({
  payments,
  total,
}: {
  payments: OwnerPendingPayment[];
  total: number;
}) {
  return (
    <section className="rounded-2xl border border-court-800/10 bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-court-800/10 px-5 py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-court-700">
            Payment review
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink-900">
            Pending receipts
          </h2>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 font-mono text-xs font-bold text-amber-900">
          {total} waiting
        </span>
      </div>

      {payments.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="font-display text-xl font-semibold text-ink-900">
            All caught up
          </p>
          <p className="mt-1 text-sm text-ink-500">
            New receipt uploads will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-court-800/10">
          {payments.map((payment) => (
            <article key={payment.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_180px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg font-bold text-ink-900">
                    {payment.customerName}
                  </p>
                  <span className="rounded-full bg-court-800/8 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-court-800">
                    {payment.typeLabel}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  {payment.reference} · {payment.courtName}
                </p>
                <p className="mt-1 text-sm text-ink-500">
                  {manilaScheduleFormatter.format(new Date(payment.startsAt))}
                </p>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-ink-500">Amount</dt>
                    <dd className="mt-0.5 font-bold text-ink-900">
                      {formatPeso(payment.amount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">GCash reference</dt>
                    <dd className="mt-0.5 break-all font-mono font-semibold text-ink-900">
                      {payment.gcashRef}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Mobile</dt>
                    <dd className="mt-0.5 font-semibold text-ink-900">
                      {payment.customerPhone}
                    </dd>
                  </div>
                </dl>

                {payment.note ? (
                  <p className="mt-4 rounded-xl bg-cream-50 px-3 py-2 text-sm text-ink-500">
                    “{payment.note}”
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                {payment.receiptUrl ? (
                  <a
                    href={payment.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-court-800/20 px-3 text-sm font-bold text-court-800 transition hover:bg-court-800/5"
                  >
                    View receipt
                  </a>
                ) : (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-700">
                    Receipt preview unavailable
                  </p>
                )}
                <ReviewButtons paymentId={payment.id} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
