import type { Metadata } from "next";
import Link from "next/link";

import { CONTACT } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Tiffany's Pickleball Court collects, uses, and protects customer information.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-sm text-ink-500">Last updated September 30, 2026</p>

      <p>
        Tiffany&apos;s Pickleball Court runs this website so customers can book
        courts, join open play and Sunday Unli sessions, and pay through GCash.
        This page explains what information we collect and how we use it.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address, and
          mobile number.
        </li>
        <li>
          <strong>Google or Facebook sign-in:</strong> if you continue with
          Google or Facebook, we receive your name and email address from that
          service. We do not receive your password and we never post on your
          behalf.
        </li>
        <li>
          <strong>Bookings:</strong> the courts, dates, times, paddle rentals,
          and sessions you reserve.
        </li>
        <li>
          <strong>Payments:</strong> the GCash reference number and the receipt
          screenshot you upload. We do not collect card or bank details.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To reserve your court and confirm your place in a session.</li>
        <li>To verify your GCash payment and reschedule reservations when needed.</li>
        <li>To send you emails about your bookings.</li>
        <li>To contact you if a booking changes.</li>
      </ul>
      <p>We do not sell your information or use it for advertising.</p>

      <h2>Who we share it with</h2>
      <p>
        We use service providers to run the website: Supabase stores accounts,
        bookings, and receipts; Vercel hosts the website; and Resend sends
        booking emails. They handle your information only to provide these
        services. We may also share information when the law requires it.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account and booking history while your account is open, so
        you can see past bookings and we can keep accurate payment records. You
        can ask us to delete it at any time.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us to correct your details or send you a copy of your
        information. To delete your account and data, follow the steps on our{" "}
        <Link
          href="/data-deletion"
          className="font-semibold text-court-800 underline"
        >
          data deletion page
        </Link>
        .
      </p>

      <h2>Contact us</h2>
      <p>
        For privacy questions, email{" "}
        <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>, call or text{" "}
        <a href={CONTACT.phoneHref}>{CONTACT.phoneDisplay}</a>, or message the{" "}
        <a href={CONTACT.facebookUrl} target="_blank" rel="noopener noreferrer">
          Tiffany&apos;s Pickleball Court Facebook page
        </a>
        .
      </p>
    </>
  );
}
