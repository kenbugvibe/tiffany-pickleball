import type { Metadata } from "next";

import { CONTACT } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Data deletion",
  description:
    "How to delete your Tiffany's Pickleball Court account and data.",
};

export default function DataDeletionPage() {
  return (
    <>
      <h1>Delete your data</h1>

      <p>
        You can ask Tiffany&apos;s Pickleball Court to delete your account and
        the information connected to it at any time. This works the same way
        whether you signed up with email, Google, or Facebook.
      </p>

      <h2>How to request deletion</h2>
      <ul>
        <li>
          Email{" "}
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>, or message
          the{" "}
          <a href={CONTACT.facebookUrl} target="_blank" rel="noopener noreferrer">
            Tiffany&apos;s Pickleball Court Facebook page
          </a>
          .
        </li>
        <li>
          Say that you want your account deleted, and include the email address
          or mobile number on your account so we can find it.
        </li>
        <li>
          We will confirm by message once your data has been deleted, usually
          within 30 days.
        </li>
      </ul>

      <h2>What we delete</h2>
      <p>
        We delete your account, name, email address, mobile number, and
        uploaded GCash receipts. We may keep basic records of past payments
        when we need them for accounting.
      </p>

      <h2>Removing Facebook access</h2>
      <p>
        You can also stop this website from using your Facebook login. On
        Facebook, go to Settings &amp; privacy, then Settings, then Apps and
        websites, and remove Tiffany&apos;s Pickleball Court.
      </p>
    </>
  );
}
