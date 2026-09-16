"use client";

import { startTransition, useActionState, useEffect, useState } from "react";

import { submitPaymentProofAction } from "@/actions/bookings";
import { emptyBookingActionState } from "@/lib/booking-form-state";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ReceiptUploadForm({
  bookingReference,
  expiresAt,
  paymentConfigured,
}: {
  bookingReference: string;
  expiresAt: string;
  paymentConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    submitPaymentProofAction,
    emptyBookingActionState,
  );
  const [compressing, setCompressing] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [expired, setExpired] = useState(
    () => new Date(expiresAt).valueOf() <= Date.now(),
  );

  useEffect(() => {
    const update = () => setExpired(new Date(expiresAt).valueOf() <= Date.now());
    const timer = window.setInterval(update, 1000);
    update();

    return () => window.clearInterval(timer);
  }, [expiresAt]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError(null);

    if (expired) {
      setClientError("This payment hold has expired. Choose the time again.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const receipt = formData.get("receipt");

    if (!(receipt instanceof File) || receipt.size === 0) {
      setClientError("Choose a receipt screenshot to upload.");
      return;
    }

    if (!ACCEPTED_TYPES.has(receipt.type)) {
      setClientError("Use a JPEG, PNG, or WebP receipt image.");
      return;
    }

    setCompressing(true);

    try {
      const { default: imageCompression } = await import(
        "browser-image-compression"
      );
      const compressed = await imageCompression(receipt, {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 1800,
        useWebWorker: false,
      });

      formData.set("receipt", compressed, compressed.name);
      setCompressing(false);
      startTransition(() => formAction(formData));
    } catch {
      setCompressing(false);
      setClientError(
        "That image could not be compressed. Try a different screenshot.",
      );
    }
  }

  const busy = compressing || pending;
  const error = clientError ?? state.error;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="bookingReference" value={bookingReference} />

      <div>
        <label
          htmlFor="gcashReference"
          className="block text-sm font-semibold text-ink-900"
        >
          GCash reference number
        </label>
        <input
          id="gcashReference"
          name="gcashReference"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          required
          placeholder="Enter the number on your receipt"
          className="mt-1.5 min-h-12 w-full rounded-xl border border-court-800/20 bg-white px-3 text-ink-900 outline-none focus:border-court-700 focus:ring-2 focus:ring-court-700/25"
        />
      </div>

      <div>
        <label
          htmlFor="receipt"
          className="block text-sm font-semibold text-ink-900"
        >
          Receipt screenshot
        </label>
        <input
          id="receipt"
          name="receipt"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          required
          className="mt-1.5 block min-h-12 w-full rounded-xl border border-dashed border-court-800/30 bg-cream-50 px-3 py-2.5 text-sm text-ink-500 file:mr-3 file:rounded-lg file:border-0 file:bg-court-800 file:px-3 file:py-2 file:font-semibold file:text-white"
        />
        <p className="mt-1.5 text-xs text-ink-500">
          Your image is compressed to approximately 300 KB before upload.
        </p>
      </div>

      <div>
        <label
          htmlFor="customerNote"
          className="block text-sm font-semibold text-ink-900"
        >
          Note for Tiffany <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <textarea
          id="customerNote"
          name="customerNote"
          maxLength={500}
          rows={3}
          className="mt-1.5 block w-full resize-y rounded-xl border border-court-800/20 bg-white px-3 py-2.5 text-ink-900 outline-none focus:border-court-700 focus:ring-2 focus:ring-court-700/25"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700"
        >
          {error}
        </p>
      ) : null}

      {!paymentConfigured ? (
        <p className="rounded-xl border border-gold-500/40 bg-[#fbf1d4] px-3 py-2.5 text-sm text-[#6b540c]">
          Payment details have not been configured yet. Do not send payment.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || expired || !paymentConfigured}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-court-800 px-5 font-bold text-white transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {compressing
          ? "Compressing receipt…"
          : pending
            ? "Sending proof…"
            : expired
              ? "Payment hold expired"
              : "Send payment proof"}
      </button>
    </form>
  );
}
