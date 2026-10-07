"use client";

import { useFormStatus } from "react-dom";

import { markPaymentRefundedAction } from "@/actions/owner";

function RefundSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-court-800 px-3 text-sm font-bold text-white transition hover:bg-court-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
    >
      {pending ? "Saving…" : "Mark refunded"}
    </button>
  );
}

export function RefundButton({
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
      action={markPaymentRefundedAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Confirm that the GCash refund for ${reference} has already been sent?`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <RefundSubmitButton />
    </form>
  );
}
