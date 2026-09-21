"use client";

import { useFormStatus } from "react-dom";

import { reviewPaymentAction } from "@/actions/owner";

function ReviewSubmitButton({ decision }: { decision: "approve" | "reject" }) {
  const { pending } = useFormStatus();
  const isApproval = decision === "approve";

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        isApproval
          ? "inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-court-800 px-3 text-sm font-bold text-white transition hover:bg-court-700 disabled:cursor-wait disabled:opacity-60"
          : "inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-red-200 px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
      }
    >
      {pending
        ? isApproval
          ? "Approving…"
          : "Rejecting…"
        : isApproval
          ? "Approve"
          : "Reject"}
    </button>
  );
}

export function ReviewButtons({ paymentId }: { paymentId: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <form action={reviewPaymentAction}>
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="decision" value="approve" />
        <ReviewSubmitButton decision="approve" />
      </form>

      <form
        action={reviewPaymentAction}
        onSubmit={(event) => {
          if (!window.confirm("Reject this receipt and cancel the reservation?")) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="decision" value="reject" />
        <ReviewSubmitButton decision="reject" />
      </form>
    </div>
  );
}
