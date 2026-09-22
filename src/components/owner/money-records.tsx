import { RefundButton } from "@/components/owner/refund-button";
import type {
  MoneyPaymentStatus,
  MoneyRecordType,
  OwnerMoneyRecord,
} from "@/lib/data/money";
import {
  manilaScheduleFormatter,
  manilaTimeFormatter,
} from "@/lib/dates";
import { formatPeso } from "@/lib/money";

const recordTypeLabels: Record<MoneyRecordType, string> = {
  court_booking: "Court booking",
  open_play: "Open Play",
  sunday_unli: "Sunday Unli",
};

const paymentStatusLabels: Record<MoneyPaymentStatus, string> = {
  unverified: "Awaiting review",
  verified: "Verified",
  rejected: "Rejected",
  refund_pending: "Refund due",
  refunded: "Refunded",
};

const paymentStatusClasses: Record<MoneyPaymentStatus, string> = {
  unverified: "bg-amber-100 text-amber-900",
  verified: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  refund_pending: "bg-orange-100 text-orange-900",
  refunded: "bg-sky-100 text-sky-800",
};

function scheduleLabel(record: OwnerMoneyRecord) {
  return `${manilaScheduleFormatter.format(new Date(record.scheduleStart))}–${manilaTimeFormatter.format(new Date(record.scheduleEnd))}`;
}

function paymentDateLabel(record: OwnerMoneyRecord) {
  return manilaScheduleFormatter.format(new Date(record.paymentCreatedAt));
}

function StatusBadge({ status }: { status: MoneyPaymentStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${paymentStatusClasses[status]}`}
    >
      {paymentStatusLabels[status]}
    </span>
  );
}

function TypeBadge({ type }: { type: MoneyRecordType }) {
  return (
    <span className="inline-flex rounded-full bg-court-800/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-court-800">
      {recordTypeLabels[type]}
    </span>
  );
}

export function MoneyRecords({
  records,
  totalRecords,
  returnTo,
}: {
  records: OwnerMoneyRecord[];
  totalRecords: number;
  returnTo: string;
}) {
  return (
    <section className="rounded-2xl border border-court-800/10 bg-white">
      <div className="flex flex-col gap-2 border-b border-court-800/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-court-700">
            Financial records
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink-900">
            Payments and reservations
          </h2>
        </div>
        <span className="font-mono text-xs font-semibold text-ink-500">
          {totalRecords} {totalRecords === 1 ? "record" : "records"}
        </span>
      </div>

      {records.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <p className="font-display text-xl font-semibold text-ink-900">
            No matching records
          </p>
          <p className="mt-1 text-sm text-ink-500">
            Change or clear the filters to see more payments.
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-court-800/10 md:hidden">
            {records.map((record) => (
              <article key={record.paymentId} className="space-y-4 px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-ink-900">
                      {record.reference}
                    </p>
                    <div className="mt-2">
                      <TypeBadge type={record.recordType} />
                    </div>
                  </div>
                  <p className="font-display text-xl font-bold text-ink-900">
                    {formatPeso(record.amount)}
                  </p>
                </div>

                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-ink-500">Customer</dt>
                    <dd className="mt-0.5 font-semibold text-ink-900">
                      {record.customerName}
                    </dd>
                    <dd className="break-all text-xs text-ink-500">
                      {record.customerEmail} · {record.customerPhone}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Schedule</dt>
                    <dd className="mt-0.5 font-semibold text-ink-900">
                      {scheduleLabel(record)}
                    </dd>
                    <dd className="text-xs text-ink-500">{record.courtNames}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">GCash reference</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-ink-900">
                      {record.gcashRef}
                    </dd>
                    <dd className="text-xs text-ink-500">
                      Received {paymentDateLabel(record)}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-col gap-3 border-t border-court-800/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <StatusBadge status={record.paymentStatus} />
                  {record.paymentStatus === "refund_pending" ? (
                    <RefundButton
                      paymentId={record.paymentId}
                      reference={record.reference}
                      returnTo={returnTo}
                    />
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-cream-50 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
                <tr>
                  <th className="px-5 py-3" scope="col">Reference</th>
                  <th className="px-5 py-3" scope="col">Customer</th>
                  <th className="px-5 py-3" scope="col">Schedule</th>
                  <th className="px-5 py-3" scope="col">Payment</th>
                  <th className="px-5 py-3" scope="col">Status</th>
                  <th className="px-5 py-3 text-right" scope="col">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-court-800/10">
                {records.map((record) => (
                  <tr key={record.paymentId} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-mono font-bold text-ink-900">
                        {record.reference}
                      </p>
                      <div className="mt-2">
                        <TypeBadge type={record.recordType} />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-ink-900">
                        {record.customerName}
                      </p>
                      <p className="mt-1 max-w-52 break-all text-xs text-ink-500">
                        {record.customerEmail}
                      </p>
                      <p className="text-xs text-ink-500">
                        {record.customerPhone}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="max-w-64 font-semibold text-ink-900">
                        {scheduleLabel(record)}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        {record.courtNames}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-display text-lg font-bold text-ink-900">
                        {formatPeso(record.amount)}
                      </p>
                      <p className="mt-1 font-mono text-xs text-ink-500">
                        {record.gcashRef}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={record.paymentStatus} />
                      <p className="mt-2 text-xs text-ink-500">
                        {record.reservationStatus}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {record.paymentStatus === "refund_pending" ? (
                        <RefundButton
                          paymentId={record.paymentId}
                          reference={record.reference}
                          returnTo={returnTo}
                        />
                      ) : (
                        <span className="text-xs text-ink-500">No action</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
