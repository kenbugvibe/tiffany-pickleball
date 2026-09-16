import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/shared/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink-900">
        Reset your password
      </h1>
      <p className="mt-1.5 text-sm text-ink-500">
        We&apos;ll email you a link to choose a new password.
      </p>

      <div className="mt-6">
        <ForgotPasswordForm />
      </div>

      <p className="mt-6 text-sm text-ink-500">
        Remembered it?{" "}
        <Link
          href="/sign-in"
          className="font-semibold text-court-800 underline underline-offset-2 hover:text-court-700"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
