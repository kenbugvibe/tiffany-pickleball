"use client";

import { reviewPaymentAction } from "@/actions/owner";

export function ReviewButtons({ paymentId }: { paymentId: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <form action={reviewPaymentAction}>
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="decision" value="approve" />
        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-court-800 px-3 text-sm font-bold text-white transition hover:bg-court-700"
        >
          Approve
        </button>
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
        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-red-200 px-3 text-sm font-bold text-red-700 transition hover:bg-red-50"
        >
          Reject
        </button>
      </form>
    </div>
  );
}
