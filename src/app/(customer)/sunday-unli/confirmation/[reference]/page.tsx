import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCustomerSundayUnliSignup } from "@/lib/data/sunday-unli";
import { manilaScheduleFormatter, manilaTimeFormatter } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export const metadata: Metadata = {
  title: "Sunday Unli registration received",
};

function statusLabel(signupStatus: string, paymentStatus: string) {
  if (signupStatus === "confirmed" && paymentStatus === "verified") {
    return "Confirmed";
  }

  if (signupStatus === "cancelled" || paymentStatus === "rejected") {
    return "Cancelled";
  }

  return "Pending verification";
}

export default async function SundayUnliConfirmationPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const signup = await getCustomerSundayUnliSignup(reference);

  if (!signup) {
    notFound();
  }

  if (!signup.payment) {
    redirect(`/sunday-unli/payment/${encodeURIComponent(reference)}`);
  }

  const label = statusLabel(signup.status, signup.payment.status);
  const confirmed = label === "Confirmed";

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
              {confirmed ? "Registration confirmed" : "Payment proof received"}
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold">
              {confirmed ? "You’re joining Sunday Unli." : "Your place is reserved."}
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/70">
              {confirmed
                ? "Tiffany verified your payment. You are confirmed for the complete session."
                : "Tiffany will verify your GCash receipt before confirming your registration."}
            </p>
          </div>

          <div className="p-6 sm:p-10">
            <div className="rounded-2xl border border-gold-500/35 bg-[#fbf1d4] p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b540c]">
                Registration reference
              </p>
              <p className="mt-2 font-mono text-3xl font-bold text-court-950">
                {signup.reference}
              </p>
            </div>

            <dl className="mt-6 divide-y divide-court-800/10 rounded-2xl border border-court-800/10 bg-white px-5">
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Event</dt>
                <dd className="text-right font-semibold text-ink-900">
                  Sunday Unli Play
                </dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Schedule</dt>
                <dd className="text-right font-semibold text-ink-900">
                  {manilaScheduleFormatter.format(
                    new Date(signup.session.startsAt),
                  )}
                  –{manilaTimeFormatter.format(new Date(signup.session.endsAt))}
                </dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Courts</dt>
                <dd className="text-right font-semibold text-ink-900">
                  {signup.session.courtNames.join(", ")}
                </dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Amount</dt>
                <dd className="text-right font-semibold text-ink-900">
                  {formatPeso(signup.amountDue)}
                </dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">GCash ref.</dt>
                <dd className="text-right font-mono font-semibold text-ink-900">
                  {signup.payment.gcash_ref}
                </dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Status</dt>
                <dd className="text-right font-bold text-[#8a6810]">
                  {label}
                </dd>
              </div>
            </dl>

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
                Return to availability
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
