import "server-only";

import { Resend } from "resend";

import { manilaScheduleFormatter } from "@/lib/dates";
import { escapeHtml } from "@/lib/notifications/court-blocked";

export type BookingRescheduledNotification = {
  id: string;
  recipient_name: string;
  recipient_email: string;
  booking_reference: string;
  court_name: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  previous_court_name: string;
  previous_starts_at: string;
  previous_ends_at: string;
};

export async function sendBookingRescheduledNotification(
  notification: BookingRescheduledNotification,
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
  const format = (value: string) =>
    manilaScheduleFormatter.format(new Date(value));
  const previousStart = format(notification.previous_starts_at);
  const previousEnd = format(notification.previous_ends_at);
  const start = format(notification.starts_at);
  const end = format(notification.ends_at);
  const note = notification.reason?.trim() ?? "";
  const noteText = note ? `\nNote from Tiffany's: ${note}\n` : "";
  const noteHtml = note
    ? `<p><strong>Note from Tiffany&apos;s:</strong> ${escapeHtml(note)}</p>`
    : "";

  const { error } = await resend.emails.send(
    {
      from: `${fromName} <${fromEmail}>`,
      to: notification.recipient_email,
      subject: `Reservation ${notification.booking_reference} was rescheduled`,
      text: `Hi ${notification.recipient_name},\n\nYour reservation has been moved to a new schedule. Your payment and amount due stay the same.\n\nReference: ${notification.booking_reference}\n\nNew schedule\nCourt: ${notification.court_name}\nStarts: ${start}\nEnds: ${end}\n\nPrevious schedule\nCourt: ${notification.previous_court_name}\nStarts: ${previousStart}\nEnds: ${previousEnd}\n${noteText}\nIf the new time does not work for you, please contact Tiffany's Pickleball Court.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#16231c"><h1 style="font-size:24px">Reservation rescheduled</h1><p>Hi ${escapeHtml(notification.recipient_name)},</p><p>Your reservation has been moved to a new schedule. Your payment and amount due stay the same.</p><p><strong>Reference:</strong> ${escapeHtml(notification.booking_reference)}</p><h2 style="font-size:16px">New schedule</h2><ul><li><strong>Court:</strong> ${escapeHtml(notification.court_name)}</li><li><strong>Starts:</strong> ${escapeHtml(start)}</li><li><strong>Ends:</strong> ${escapeHtml(end)}</li></ul><h2 style="font-size:16px;color:#5b6b62">Previous schedule</h2><ul style="color:#5b6b62"><li>Court: ${escapeHtml(notification.previous_court_name)}</li><li>Starts: ${escapeHtml(previousStart)}</li><li>Ends: ${escapeHtml(previousEnd)}</li></ul>${noteHtml}<p>If the new time does not work for you, please contact Tiffany&apos;s Pickleball Court.</p></div>`,
    },
    { idempotencyKey: `booking-rescheduled/${notification.id}` },
  );

  if (error) {
    return {
      ok: false as const,
      error: error.message || "Resend rejected the email request.",
    };
  }

  return { ok: true as const };
}
