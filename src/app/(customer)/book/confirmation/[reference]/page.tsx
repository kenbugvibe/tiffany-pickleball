import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCustomerBooking } from "@/lib/data/bookings";
import { manilaScheduleFormatter, manilaTimeFormatter } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export const metadata: Metadata = {
  title: "Booking received",
};

export default async function BookingConfirmationPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const booking = await getCustomerBooking(reference);

  if (!booking) {
    notFound();
  }

  if (!booking.payment) {
    redirect(`/book/payment/${encodeURIComponent(reference)}`);
  }

  return (
    <main className="min-h-screen bg-court-950 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-display font-bold text-gold-200"
        >
          Tiffany&apos;s Pickleball Court
        </Link>

        <section className="mt-5 overflow-hidden rounded-3xl bg-cream-50 shadow-[0_24px_70px_rgba(0,0,0,.3)]">
          <div className="bg-court-800 px-6 py-8 text-center text-white sm:px-10">
            <span
              aria-hidden="true"
              className="mx-auto grid size-14 place-items-center rounded-full bg-gold-500 text-2xl font-bold text-court-950"
            >
              ✓
            </span>
            <p className="mt-4 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-gold-200">
              Payment proof received
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold">
              Your court is reserved.
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Tiffany will verify your GCash receipt. The booking remains pending
              until it is approved.
            </p>
          </div>

          <div className="p-6 sm:p-10">
            <div className="rounded-2xl border border-gold-500/35 bg-[#fbf1d4] p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b540c]">
                Booking reference
              </p>
              <p className="mt-2 font-mono text-3xl font-bold text-court-950">
                {booking.reference}
              </p>
            </div>

            <dl className="mt-6 divide-y divide-court-800/10 rounded-2xl border border-court-800/10 bg-white px-5">
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Schedule</dt>
                <dd className="text-right font-semibold text-ink-900">
                  {manilaScheduleFormatter.format(new Date(booking.starts_at))}–
                  {manilaTimeFormatter.format(new Date(booking.ends_at))}
                </dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Court</dt>
                <dd className="text-right font-semibold text-ink-900">
                  {booking.court_name}
                </dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Paddles</dt>
                <dd className="text-right font-semibold text-ink-900">
                  {booking.paddle_count}
                </dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Amount</dt>
                <dd className="text-right font-semibold text-ink-900">
                  {formatPeso(booking.total_amount)}
                </dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">GCash ref.</dt>
                <dd className="text-right font-mono font-semibold text-ink-900">
                  {booking.payment.gcash_ref}
                </dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Status</dt>
                <dd className="text-right font-bold text-[#8a6810]">
                  Pending verification
                </dd>
              </div>
            </dl>

            {booking.customer_note ? (
              <div className="mt-5 rounded-xl bg-white p-4 text-sm">
                <p className="font-bold text-ink-900">Your note</p>
                <p className="mt-1 whitespace-pre-wrap text-ink-500">
                  {booking.customer_note}
                </p>
              </div>
            ) : null}

            <Link
              href="/#availability"
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-court-800 px-5 font-bold text-white hover:bg-court-700"
            >
              Book another court
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
