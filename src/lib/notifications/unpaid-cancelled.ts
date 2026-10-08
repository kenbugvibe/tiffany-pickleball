import "server-only";

import { Resend } from "resend";

import { CONTACT_EMAIL_HTML, CONTACT_EMAIL_TEXT } from "@/lib/contact";
import { manilaScheduleFormatter } from "@/lib/dates";
import { escapeHtml } from "@/lib/notifications/court-blocked";

export type UnpaidCancelledNotification = {
  id: string;
  recipient_name: string;
  recipient_email: string;
  booking_reference: string;
  court_name: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

export async function sendUnpaidCancelledNotification(
  notification: UnpaidCancelledNotification,
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
  const note = notification.reason?.trim() ?? "";
  const noteText = note ? `\nNote from Tiffany's: ${note}` : "";
  const noteHtml = note
    ? `<p><strong>Note from Tiffany&apos;s:</strong> ${escapeHtml(note)}</p>`
    : "";

  const { error } = await resend.emails.send(
    {
      from: `${fromName} <${fromEmail}>`,
      to: notification.recipient_email,
      subject: `Reservation ${notification.booking_reference} was cancelled`,
      text: `Hi ${notification.recipient_name},\n\nYour reservation was cancelled because we did not receive a GCash payment for it, and the slot has been released.\n\nReference: ${notification.booking_reference}\nCourt: ${notification.court_name}\nStarts: ${start}\nEnds: ${end}${noteText}\n\nYou are welcome to book again on our website. If you already paid, please contact Tiffany's Pickleball Court with your GCash reference number.${CONTACT_EMAIL_TEXT}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#16231c"><h1 style="font-size:24px">Reservation cancelled</h1><p>Hi ${escapeHtml(notification.recipient_name)},</p><p>Your reservation was cancelled because we did not receive a GCash payment for it, and the slot has been released.</p><ul><li><strong>Reference:</strong> ${escapeHtml(notification.booking_reference)}</li><li><strong>Court:</strong> ${escapeHtml(notification.court_name)}</li><li><strong>Starts:</strong> ${escapeHtml(start)}</li><li><strong>Ends:</strong> ${escapeHtml(end)}</li></ul>${noteHtml}<p>You are welcome to book again on our website. If you already paid, please contact Tiffany&apos;s Pickleball Court with your GCash reference number.</p>${CONTACT_EMAIL_HTML}</div>`,
    },
    { idempotencyKey: `unpaid-cancelled/${notification.id}` },
  );

  if (error) {
    return {
      ok: false as const,
      error: error.message || "Resend rejected the email request.",
    };
  }

  return { ok: true as const };
}
