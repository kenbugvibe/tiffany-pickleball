import type { Metadata } from "next";
import Link from "next/link";

import { MoneyRecords } from "@/components/owner/money-records";
import { MetricCard } from "@/components/owner/metric-card";
import {
  getOwnerMoneyData,
  ownerMoneyQueryString,
  parseOwnerMoneyQuery,
} from "@/lib/data/money";
import { formatPeso } from "@/lib/money";

export const metadata: Metadata = {
  title: "Money",
};

type OwnerMoneyPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(
  query: ReturnType<typeof parseOwnerMoneyQuery>,
  page: number,
) {
  const search = ownerMoneyQueryString(query, { page });
  return search ? `/owner/money?${search}` : "/owner/money";
}

export default async function OwnerMoneyPage({
  searchParams,
}: OwnerMoneyPageProps) {
  const params = await searchParams;
  const query = parseOwnerMoneyQuery(params);
  const data = await getOwnerMoneyData(query);
  const refunded = first(params.refunded);
  const error = first(params.error);
  const currentSearch = ownerMoneyQueryString(query);
  const returnTo = currentSearch
    ? `/owner/money?${currentSearch}`
    : "/owner/money";
  const exportSearch = ownerMoneyQueryString(query, {
    includePage: false,
  });
  const exportHref = exportSearch
    ? `/api/exports/bookings?${exportSearch}`
    : "/api/exports/bookings";
  const errorMessages: Record<string, string> = {
    "invalid-refund": "That refund record was invalid. Refresh the page and try again.",
    "refund-failed":
      "The refund could not be saved. Confirm the Phase 7 Owner Money migration is applied, then try again.",
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-court-700">
            Financial records
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold text-ink-900 sm:text-5xl">
            Money
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-500">
            Track verified revenue, review payment history, and complete refunds after the money has been returned through GCash.
          </p>
        </div>

        {data.ok ? (
          <a
            href={exportHref}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-court-800/20 bg-white px-4 text-sm font-bold text-court-800 transition hover:bg-court-800/5"
          >
            Export filtered CSV
          </a>
        ) : null}
      </div>

      {refunded ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Payment {refunded} was marked refunded.
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {errorMessages[error] ?? "The requested Money action could not be completed."}
        </div>
      ) : null}

      {!data.ok ? (
        <section className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <p className="font-display text-2xl font-bold text-amber-950">
            Owner Money setup required
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
            {data.error}
          </p>
          <p className="mt-4 font-mono text-xs font-semibold text-amber-950">
            supabase/migrations/202609220013_phase_7_owner_money.sql
          </p>
        </section>
      ) : (
        <>
          <section
            className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Financial summary"
          >
            <MetricCard
              label="Verified revenue"
              value={formatPeso(data.summary.verifiedRevenue)}
              detail="Confirmed, non-refunded payments"
              accent
            />
            <MetricCard
              label="Awaiting review"
              value={String(data.summary.unverifiedCount)}
              detail="Receipts still needing approval"
            />
            <MetricCard
              label="Refunds due"
              value={formatPeso(data.summary.refundPendingAmount)}
              detail="Return these through GCash"
            />
            <MetricCard
              label="Refunded"
              value={formatPeso(data.summary.refundedAmount)}
              detail={`${data.summary.recordCount} total payment records`}
            />
          </section>

          <form
            method="get"
            className="mt-7 grid gap-4 rounded-2xl border border-court-800/10 bg-white p-5 lg:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(140px,.75fr))_auto] lg:items-end"
          >
            <label className="text-sm font-semibold text-ink-900">
              Search
              <input
                type="search"
                name="q"
                defaultValue={query.query}
                placeholder="Reference, customer, mobile, or GCash"
                className="mt-1.5 min-h-11 w-full rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none placeholder:text-ink-500/60 focus:border-court-700"
              />
            </label>

            <label className="text-sm font-semibold text-ink-900">
              Payment status
              <select
                name="status"
                defaultValue={query.status ?? ""}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-court-700"
              >
                <option value="">All statuses</option>
                <option value="unverified">Awaiting review</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
                <option value="refund_pending">Refund due</option>
                <option value="refunded">Refunded</option>
              </select>
            </label>

            <label className="text-sm font-semibold text-ink-900">
              Booking type
              <select
                name="type"
                defaultValue={query.type ?? ""}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-court-700"
              >
                <option value="">All types</option>
                <option value="court_booking">Court booking</option>
                <option value="open_play">Open Play</option>
                <option value="sunday_unli">Sunday Unli</option>
              </select>
            </label>

            <label className="text-sm font-semibold text-ink-900">
              Paid from
              <input
                type="date"
                name="from"
                defaultValue={query.from ?? ""}
                max={query.to ?? undefined}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-court-700"
              />
            </label>

            <label className="text-sm font-semibold text-ink-900">
              Paid to
              <input
                type="date"
                name="to"
                defaultValue={query.to ?? ""}
                min={query.from ?? undefined}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-court-800/20 bg-white px-3 font-normal outline-none focus:border-court-700"
              />
            </label>

            <div className="flex gap-2 lg:flex-col">
              <button
                type="submit"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-court-800 px-4 text-sm font-bold text-white transition hover:bg-court-700"
              >
                Apply filters
              </button>
              <Link
                href="/owner/money"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-court-800/20 px-4 text-sm font-bold text-court-800 transition hover:bg-court-800/5"
              >
                Clear
              </Link>
            </div>
          </form>

          <div className="mt-7">
            <MoneyRecords
              records={data.records}
              totalRecords={data.totalRecords}
              returnTo={returnTo}
            />
          </div>

          {data.totalPages > 1 ? (
            <nav
              className="mt-5 flex items-center justify-between gap-4"
              aria-label="Financial records pages"
            >
              {query.page > 1 ? (
                <Link
                  href={pageHref(query, query.page - 1)}
                  className="inline-flex min-h-11 items-center rounded-xl border border-court-800/20 bg-white px-4 text-sm font-bold text-court-800"
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="font-mono text-xs font-semibold text-ink-500">
                Page {query.page} of {data.totalPages}
              </span>
              {query.page < data.totalPages ? (
                <Link
                  href={pageHref(query, query.page + 1)}
                  className="inline-flex min-h-11 items-center rounded-xl border border-court-800/20 bg-white px-4 text-sm font-bold text-court-800"
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
