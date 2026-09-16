"use client";

import { useEffect, useState } from "react";

function secondsUntil(expiresAt: string) {
  return Math.max(
    0,
    Math.ceil((new Date(expiresAt).valueOf() - Date.now()) / 1000),
  );
}

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function HoldCountdown({
  expiresAt,
}: {
  expiresAt: string;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setRemaining(secondsUntil(expiresAt));
    const initialTimer = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [expiresAt]);

  const active = remaining === null || remaining > 0;

  return (
    <div
      role="timer"
      aria-live="polite"
      className={`rounded-2xl border px-4 py-3 text-center ${
        active
          ? "border-gold-500/50 bg-[#fbf1d4] text-[#6b540c]"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em]">
        {active ? "Payment hold remaining" : "Payment hold expired"}
      </p>
      <p className="mt-1 font-mono text-3xl font-bold">
        {remaining === null ? "Calculating…" : formatRemaining(remaining)}
      </p>
    </div>
  );
}
