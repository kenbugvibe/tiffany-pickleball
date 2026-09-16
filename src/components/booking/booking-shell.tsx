import Link from "next/link";

const steps = ["Court", "Time", "Paddles", "GCash", "Proof"];

export function BookingShell({
  children,
  currentStep,
}: Readonly<{
  children: React.ReactNode;
  currentStep: number;
}>) {
  return (
    <main className="min-h-screen bg-cream-50">
      <header className="border-b border-white/10 bg-court-950 text-white">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-full border border-gold-200/40 bg-court-800 font-mono text-xs font-semibold text-gold-200"
            >
              TP
            </span>
            <span className="font-display font-bold text-gold-200">
              TIFFANY&apos;S
            </span>
          </Link>
          <Link
            href="/#availability"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-white/75 hover:text-white"
          >
            Back to availability
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        <ol
          aria-label="Booking progress"
          className="grid grid-cols-5 gap-1 rounded-2xl border border-court-800/10 bg-white p-2 sm:gap-2 sm:p-3"
        >
          {steps.map((step, index) => {
            const number = index + 1;
            const active = number <= currentStep;

            return (
              <li
                key={step}
                aria-current={number === currentStep ? "step" : undefined}
                className={`rounded-xl px-1 py-2 text-center text-[10px] font-bold sm:px-3 sm:text-xs ${
                  active
                    ? "bg-court-800 text-white"
                    : "bg-cream-50 text-ink-500"
                }`}
              >
                <span className="block font-mono text-[9px] opacity-70">
                  {number}
                </span>
                {step}
              </li>
            );
          })}
        </ol>

        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
