import "server-only";

import { Resend } from "resend";

import { manilaScheduleFormatter } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { escapeHtml } from "@/lib/notifications/court-blocked";

export type EventCancelledNotification = {
  id: string;
  recipient_name: string;
  recipient_email: string;
  booking_reference: string;
  event_label: string;
  court_name: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  refund_amount: number;
};

export async function sendEventCancelledNotification(
  notification: EventCancelledNotification,
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
  const reason = notification.reason?.trim() ?? "";
  const reasonText = reason ? `\nReason: ${reason}` : "";
  const reasonHtml = reason
    ? `<li><strong>Reason:</strong> ${escapeHtml(reason)}</li>`
    : "";
  // refund_amount is the legacy column name. It now holds the amount paid,
  // which carries over to another session instead of being refunded.
  const paidText =
    notification.refund_amount > 0
      ? `\n\nYour payment of ${formatPeso(notification.refund_amount)} is not lost. Tiffany's will contact you to move you to another session at no extra cost.`
      : "";
  const paidHtml =
    notification.refund_amount > 0
      ? `<p>Your payment of <strong>${escapeHtml(formatPeso(notification.refund_amount))}</strong> is not lost. Tiffany&apos;s will contact you to move you to another session at no extra cost.</p>`
      : "";

  const { error } = await resend.emails.send(
    {
      from: `${fromName} <${fromEmail}>`,
      to: notification.recipient_email,
      subject: `${notification.event_label} on ${start} was cancelled`,
      text: `Hi ${notification.recipient_name},\n\nWe're sorry, but ${notification.event_label} has been cancelled and your registration is no longer active.\n\nRegistration: ${notification.booking_reference}\nCourts: ${notification.court_name}\nStarts: ${start}\nEnds: ${end}${reasonText}${paidText}\n\nWe hope to see you at another session. Please contact Tiffany's Pickleball Court if you have questions.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#16231c"><h1 style="font-size:24px">${escapeHtml(notification.event_label)} cancelled</h1><p>Hi ${escapeHtml(notification.recipient_name)},</p><p>We&apos;re sorry, but ${escapeHtml(notification.event_label)} has been cancelled and your registration is no longer active.</p><ul><li><strong>Registration:</strong> ${escapeHtml(notification.booking_reference)}</li><li><strong>Courts:</strong> ${escapeHtml(notification.court_name)}</li><li><strong>Starts:</strong> ${escapeHtml(start)}</li><li><strong>Ends:</strong> ${escapeHtml(end)}</li>${reasonHtml}</ul>${paidHtml}<p>We hope to see you at another session. Please contact Tiffany&apos;s Pickleball Court if you have questions.</p></div>`,
    },
    { idempotencyKey: `event-cancelled/${notification.id}` },
  );

  if (error) {
    return {
      ok: false as const,
      error: error.message || "Resend rejected the email request.",
    };
  }

  return { ok: true as const };
}
