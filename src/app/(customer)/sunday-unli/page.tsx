import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { OpenPlayShell } from "@/components/booking/open-play-shell";
import { SundayUnliJoinForm } from "@/components/booking/sunday-unli-join-form";
import { ensureCustomerProfile } from "@/lib/data/customers";
import {
  getActiveSundayUnliSignupForSession,
  getPublishedSundayUnliSession,
} from "@/lib/data/sunday-unli";
import { manilaScheduleFormatter, manilaTimeFormatter } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export const metadata: Metadata = {
  title: "Join Sunday Unli",
};

type SundayUnliPageProps = {
  searchParams: Promise<{ session?: string | string[] }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SundayUnliPage({
  searchParams,
}: SundayUnliPageProps) {
  const params = await searchParams;
  const sessionId = first(params.session) ?? "";
  const [session, customerId] = await Promise.all([
    getPublishedSundayUnliSession(sessionId),
    ensureCustomerProfile(),
  ]);

  if (!session) {
    notFound();
  }

  if (!customerId) {
    return (
      <OpenPlayShell>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          <h1 className="font-display text-2xl font-bold">
            Customer profile incomplete
          </h1>
          <p className="mt-2 text-sm leading-6">
            This account is missing the full name or Philippine mobile number
            needed to join Sunday Unli. Sign out and create the customer
            account again.
          </p>
        </div>
      </OpenPlayShell>
    );
  }

  const existingSignup = await getActiveSundayUnliSignupForSession(session.id);

  if (existingSignup) {
    if (
      existingSignup.status === "confirmed" ||
      existingSignup.payment_proof_submitted_at
    ) {
      redirect(
        `/sunday-unli/confirmation/${encodeURIComponent(existingSignup.reference)}`,
      );
    }

    if (
      existingSignup.status === "pending" &&
      existingSignup.hold_expires_at &&
      new Date(existingSignup.hold_expires_at) > new Date()
    ) {
      redirect(
        `/sunday-unli/payment/${encodeURIComponent(existingSignup.reference)}`,
      );
    }
  }

  const paymentConfigured = Boolean(
    process.env.GCASH_ACCOUNT_NAME?.trim() &&
      process.env.GCASH_MOBILE_NUMBER?.trim(),
  );

  return (
    <OpenPlayShell>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="overflow-hidden rounded-3xl border border-violet-300 bg-white shadow-[0_14px_45px_rgba(7,52,28,.08)]">
          <div className="bg-court-950 px-6 py-8 text-white sm:px-8">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-gold-200">
              Sunday night special
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold">
              Sunday Unli Play
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">
              One registration covers the complete five-hour session across all
              three courts. Tiffany confirms your place after verifying your
              GCash receipt.
            </p>
          </div>

          <div className="p-6 sm:p-8">
            <dl className="divide-y divide-court-800/10 rounded-2xl border border-court-800/10 bg-cream-50 px-5">
              <div className="grid grid-cols-[100px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Schedule</dt>
                <dd className="text-right font-semibold text-ink-900">
                  {manilaScheduleFormatter.format(new Date(session.startsAt))}–
                  {manilaTimeFormatter.format(new Date(session.endsAt))}
                </dd>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Courts</dt>
                <dd className="text-right font-semibold text-ink-900">
                  {session.courtNames.join(", ")}
                </dd>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Entry</dt>
                <dd className="text-right text-lg font-bold text-court-800">
                  {formatPeso(session.pricePerPlayer)} per person
                </dd>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3 py-4 text-sm">
                <dt className="text-ink-500">Reference</dt>
                <dd className="text-right font-mono font-bold text-ink-900">
                  {session.reference}
                </dd>
              </div>
            </dl>

            {session.customerNote ? (
              <div className="mt-5 rounded-xl border border-gold-500/35 bg-[#fbf1d4] p-4 text-sm leading-6 text-[#6b540c]">
                <p className="font-bold">Message from Tiffany</p>
                <p className="mt-1 whitespace-pre-wrap">
                  {session.customerNote}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="h-fit rounded-3xl border border-court-800/10 bg-white p-6 shadow-[0_14px_45px_rgba(7,52,28,.07)] sm:p-8">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-court-700">
            Reserve your place
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-ink-900">
            Play all night for {formatPeso(session.pricePerPlayer)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-500">
            Register once for the complete 7:00 PM to midnight session. One
            account can register once for this Sunday.
          </p>

          <div className="mt-6">
            <SundayUnliJoinForm
              sessionId={session.id}
              priceLabel={formatPeso(session.pricePerPlayer)}
              paymentConfigured={paymentConfigured}
            />
          </div>
        </aside>
      </div>
    </OpenPlayShell>
  );
}
