"use client";

import { useFormStatus } from "react-dom";

import { markPaymentRescheduledAction } from "@/actions/owner";

function MarkRescheduledSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-court-800 px-3 text-sm font-bold text-white transition hover:bg-court-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
    >
      {pending ? "Saving…" : "Mark rescheduled"}
    </button>
  );
}

export function MarkRescheduledButton({
  paymentId,
  reference,
  returnTo,
}: {
  paymentId: string;
  reference: string;
  returnTo: string;
}) {
  return (
    <form
      action={markPaymentRescheduledAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Confirm that the player for ${reference} has been moved to another session?`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <MarkRescheduledSubmitButton />
    </form>
  );
}
