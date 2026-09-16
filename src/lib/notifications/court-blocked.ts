import "server-only";

import { Resend } from "resend";

import { manilaScheduleFormatter } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export type CourtBlockedNotification = {
  id: string;
  recipient_name: string;
  recipient_email: string;
  booking_reference: string;
  court_name: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  refund_amount: number;
};

export function isCustomerEmailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
      process.env.RESEND_FROM_EMAIL?.trim(),
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendCourtBlockedNotification(
  notification: CourtBlockedNotification,
) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  const fromName =
    process.env.RESEND_FROM_NAME?.trim() || "Tiffany's Pickleball Court";

  if (!apiKey || !fromEmail) {
    return {
      ok: false as const,
      error: "Customer email delivery is not configured.",
    };
  }

  const resend = new Resend(apiKey);
  const start = manilaScheduleFormatter.format(
    new Date(notification.starts_at),
  );
  const end = manilaScheduleFormatter.format(new Date(notification.ends_at));
  const refundText =
    notification.refund_amount > 0
      ? `\nYour verified payment of ${formatPeso(notification.refund_amount)} is now marked for refund. Tiffany's will contact you about the refund.`
      : "";
  const refundHtml =
    notification.refund_amount > 0
      ? `<p>Your verified payment of <strong>${escapeHtml(formatPeso(notification.refund_amount))}</strong> is now marked for refund. Tiffany&apos;s will contact you about the refund.</p>`
      : "";

  const { error } = await resend.emails.send(
    {
      from: `${fromName} <${fromEmail}>`,
      to: notification.recipient_email,
      subject: `Reservation ${notification.booking_reference} was cancelled`,
      text: `Hi ${notification.recipient_name},\n\nWe're sorry, but your reservation has been cancelled because the court is unavailable.\n\nReference: ${notification.booking_reference}\nCourt: ${notification.court_name}\nStarts: ${start}\nEnds: ${end}\nReason: ${notification.reason}${refundText}\n\nIf you need help choosing another time, please contact Tiffany's Pickleball Court.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#16231c"><h1 style="font-size:24px">Reservation cancelled</h1><p>Hi ${escapeHtml(notification.recipient_name)},</p><p>We&apos;re sorry, but your reservation has been cancelled because the court is unavailable.</p><ul><li><strong>Reference:</strong> ${escapeHtml(notification.booking_reference)}</li><li><strong>Court:</strong> ${escapeHtml(notification.court_name)}</li><li><strong>Starts:</strong> ${escapeHtml(start)}</li><li><strong>Ends:</strong> ${escapeHtml(end)}</li><li><strong>Reason:</strong> ${escapeHtml(notification.reason)}</li></ul>${refundHtml}<p>If you need help choosing another time, please contact Tiffany&apos;s Pickleball Court.</p></div>`,
    },
    { idempotencyKey: `court-blocked/${notification.id}` },
  );

  if (error) {
    return {
      ok: false as const,
      error: error.message || "Resend rejected the email request.",
    };
  }

  return { ok: true as const };
}
