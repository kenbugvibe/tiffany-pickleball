import "server-only";

import { Resend } from "resend";

import { CONTACT_EMAIL_HTML, CONTACT_EMAIL_TEXT } from "@/lib/contact";
import { manilaScheduleFormatter } from "@/lib/dates";
import { escapeHtml } from "@/lib/notifications/court-blocked";

export type ReceiptRejectedNotification = {
  id: string;
  recipient_name: string;
  recipient_email: string;
  booking_reference: string;
  event_label: string | null;
  court_name: string;
  starts_at: string;
  ends_at: string;
};

export async function sendReceiptRejectedNotification(
  notification: ReceiptRejectedNotification,
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
  const label = notification.event_label?.trim() || "Court booking";
  const courtLabel = notification.event_label ? "Courts" : "Court";

  const { error } = await resend.emails.send(
    {
      from: `${fromName} <${fromEmail}>`,
      to: notification.recipient_email,
      subject: `We could not verify your payment for ${notification.booking_reference}`,
      text: `Hi ${notification.recipient_name},\n\nWe could not verify the GCash receipt you sent, so your reservation has been cancelled and the slot has been released.\n\nReference: ${notification.booking_reference}\nReservation: ${label}\n${courtLabel}: ${notification.court_name}\nStarts: ${start}\nEnds: ${end}\n\nIf you already paid or believe this is a mistake, please contact Tiffany's Pickleball Court with your GCash reference number. You are welcome to book again on our website.${CONTACT_EMAIL_TEXT}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#16231c"><h1 style="font-size:24px">Payment not verified</h1><p>Hi ${escapeHtml(notification.recipient_name)},</p><p>We could not verify the GCash receipt you sent, so your reservation has been cancelled and the slot has been released.</p><ul><li><strong>Reference:</strong> ${escapeHtml(notification.booking_reference)}</li><li><strong>Reservation:</strong> ${escapeHtml(label)}</li><li><strong>${courtLabel}:</strong> ${escapeHtml(notification.court_name)}</li><li><strong>Starts:</strong> ${escapeHtml(start)}</li><li><strong>Ends:</strong> ${escapeHtml(end)}</li></ul><p>If you already paid or believe this is a mistake, please contact Tiffany&apos;s Pickleball Court with your GCash reference number. You are welcome to book again on our website.</p>${CONTACT_EMAIL_HTML}</div>`,
    },
    { idempotencyKey: `receipt-rejected/${notification.id}` },
  );

  if (error) {
    return {
      ok: false as const,
      error: error.message || "Resend rejected the email request.",
    };
  }

  return { ok: true as const };
}
