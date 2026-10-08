"use client";

import { useFormStatus } from "react-dom";

import { cancelMyUnpaidBookingAction } from "@/actions/bookings";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-red-200 px-4 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Cancelling…" : "Cancel booking"}
    </button>
  );
}

export function CancelUnpaidButton({
  bookingId,
  reference,
}: {
  bookingId: string;
  reference: string;
}) {
  return (
    <form
      action={cancelMyUnpaidBookingAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Cancel booking ${reference}? The court time will be released.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <SubmitButton />
    </form>
  );
}
