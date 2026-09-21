"use client";

import { useActionState } from "react";

import { createOpenPlaySignupAction } from "@/actions/open-play";
import { emptyBookingActionState } from "@/lib/booking-form-state";

export function OpenPlayJoinForm({
  sessionId,
  priceLabel,
  paymentConfigured,
}: {
  sessionId: string;
  priceLabel: string;
  paymentConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createOpenPlaySignupAction,
    emptyBookingActionState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="sessionId" value={sessionId} />

      {state.error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      {!paymentConfigured ? (
        <p className="mb-4 rounded-xl border border-gold-500/40 bg-[#fbf1d4] px-4 py-3 text-sm leading-6 text-[#6b540c]">
          Online registration is temporarily unavailable because Tiffany&apos;s
          payment details are not configured.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !paymentConfigured}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-court-800 px-5 font-bold text-white transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Creating payment hold…" : "Join open play"}
      </button>
      <p className="mt-3 text-center text-xs leading-5 text-ink-500">
        Your place is held for 30 minutes while you send {priceLabel} through
        GCash and upload the receipt.
      </p>
    </form>
  );
}
