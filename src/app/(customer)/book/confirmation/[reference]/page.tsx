import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCustomerBooking } from "@/lib/data/bookings";
import { manilaScheduleFormatter, manilaTimeFormatter } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export const metadata: Metadata = {
  title: "Booking received",
};

function confirmationState(bookingStatus: string, paymentStatus: string) {
  if (paymentStatus === "refunded") {
    return {
      eyebrow: "Refund completed",
      headline: "Your booking was refunded.",
      description: "Tiffany marked the GCash refund as completed.",
      label: "Refunded",
      statusClass: "text-sky-700",
    };
  }

  if (paymentStatus === "refund_pending") {
    return {
      eyebrow: "Refund in progress",
      headline: "Your booking was cancelled.",
      description: "Tiffany is preparing the return of your verified payment.",
      label: "Refund pending",
      statusClass: "text-orange-700",
    };
  }

  if (bookingStatus === "confirmed" && paymentStatus === "verified") {
    return {
      eyebrow: "Booking confirmed",
      headline: "Your court is confirmed.",
      description: "Tiffany verified your payment. Your court is ready for you.",
      label: "Confirmed",
      statusClass: "text-emerald-700",
    };
  }

  if (bookingStatus === "cancelled" || paymentStatus === "rejected") {
    return {
      eyebrow: "Booking cancelled",
      headline: "This booking is no longer active.",
      description: "The reservation was cancelled or its payment was rejected.",
      label: "Cancelled",
      statusClass: "text-red-700",
    };
  }

  return {
    eyebrow: "Payment proof received",
    headline: "Your court is reserved.",
    description:
      "Tiffany will verify your GCash receipt. The booking remains pending until it is approved.",
    label: "Pending verification",
    statusClass: "text-[#8a6810]",
  };
}

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

  const state = confirmationState(booking.status, booking.payment.status);

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
              {state.eyebrow}
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold">
              {state.headline}
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/70">
              {state.description}
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
                <dd className={`text-right font-bold ${state.statusClass}`}>
                  {state.label}
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

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                href="/my-bookings"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-court-800/20 bg-white px-5 font-bold text-court-800 hover:bg-court-800/5"
              >
                View my bookings
              </Link>
              <Link
                href="/#availability"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-court-800 px-5 font-bold text-white hover:bg-court-700"
              >
                Book another court
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
