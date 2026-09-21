import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { HoldCountdown } from "@/components/booking/hold-countdown";
import { OpenPlayShell } from "@/components/booking/open-play-shell";
import { ReceiptUploadForm } from "@/components/booking/receipt-upload-form";
import { getCustomerSundayUnliSignup } from "@/lib/data/sunday-unli";
import { manilaScheduleFormatter, manilaTimeFormatter } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export const metadata: Metadata = {
  title: "Pay for Sunday Unli",
};

export default async function SundayUnliPaymentPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const signup = await getCustomerSundayUnliSignup(reference);

  if (!signup) {
    notFound();
  }

  if (signup.payment) {
    redirect(`/sunday-unli/confirmation/${encodeURIComponent(reference)}`);
  }

  const expiresAt = signup.holdExpiresAt;
  const expired = signup.status !== "pending" || !expiresAt;
  const gcashName = process.env.GCASH_ACCOUNT_NAME?.trim() ?? "";
  const gcashNumber = process.env.GCASH_MOBILE_NUMBER?.trim() ?? "";
  const configuredQrPath = process.env.GCASH_QR_IMAGE_PATH?.trim() ?? "";
  const qrPath =
    configuredQrPath.startsWith("/") && !configuredQrPath.startsWith("//")
      ? configuredQrPath
      : "";
  const paymentConfigured = Boolean(gcashName && gcashNumber);

  return (
    <OpenPlayShell>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          {expiresAt ? <HoldCountdown expiresAt={expiresAt} /> : null}

          <section className="rounded-2xl border border-court-800/10 bg-white p-5 shadow-[0_8px_30px_rgba(7,52,28,.06)] sm:p-7">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-court-700">
              Pay through GCash
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold text-ink-900">
              Send {formatPeso(signup.amountDue)}
            </h1>

            {qrPath ? (
              <div className="mx-auto mt-5 max-w-72 overflow-hidden rounded-2xl border border-court-800/10 bg-white p-3">
                <Image
                  src={qrPath}
                  alt="Tiffany's GCash QR code"
                  width={640}
                  height={640}
                  className="h-auto w-full"
                  priority
                />
              </div>
            ) : null}

            {paymentConfigured ? (
              <dl className="mt-5 space-y-3 rounded-xl bg-cream-50 p-4 text-sm">
                <div>
                  <dt className="text-ink-500">Account name</dt>
                  <dd className="mt-0.5 font-bold text-ink-900">{gcashName}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">GCash mobile number</dt>
                  <dd className="mt-0.5 font-mono text-lg font-bold text-ink-900">
                    {gcashNumber}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-5 rounded-xl border border-gold-500/40 bg-[#fbf1d4] p-4 text-sm leading-6 text-[#6b540c]">
                Tiffany&apos;s GCash details have not been configured. Do not send
                payment until the official account details appear here.
              </p>
            )}

            <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-6 text-ink-500">
              <li>Send the exact amount shown above.</li>
              <li>Save or screenshot the successful GCash receipt.</li>
              <li>Upload it before the payment hold ends.</li>
            </ol>
          </section>

          <section className="rounded-2xl border border-court-800/10 bg-white p-5 text-sm sm:p-6">
            <p className="font-display text-lg font-bold text-ink-900">
              Sunday Unli Play
            </p>
            <p className="mt-1 text-ink-500">
              {manilaScheduleFormatter.format(
                new Date(signup.session.startsAt),
              )}
              –{manilaTimeFormatter.format(new Date(signup.session.endsAt))}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-court-800/10 pt-4">
              <div>
                <dt className="text-ink-500">Courts</dt>
                <dd className="mt-1 font-bold text-ink-900">
                  {signup.session.courtNames.join(", ")}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Reference</dt>
                <dd className="mt-1 font-mono font-bold text-ink-900">
                  {signup.reference}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="h-fit rounded-2xl border border-court-800/10 bg-white p-5 shadow-[0_8px_30px_rgba(7,52,28,.06)] sm:p-7">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-court-700">
            Upload proof
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-ink-900">
            Send your receipt
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-500">
            Your registration remains pending until Tiffany verifies the
            payment.
          </p>

          <div className="mt-6">
            {expired || !expiresAt ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-bold">This payment hold has expired.</p>
                <p className="mt-1">Return to the event and register again.</p>
                <Link
                  href={`/sunday-unli?session=${encodeURIComponent(signup.sessionId)}`}
                  className="mt-3 inline-flex min-h-11 items-center font-bold underline underline-offset-2"
                >
                  Return to Sunday Unli
                </Link>
              </div>
            ) : (
              <ReceiptUploadForm
                reference={signup.reference}
                paymentKind="sunday-unli"
                expiresAt={expiresAt}
                paymentConfigured={paymentConfigured}
              />
            )}
          </div>
        </section>
      </div>
    </OpenPlayShell>
  );
}
