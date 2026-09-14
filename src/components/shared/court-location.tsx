export const COURT_ADDRESS = "Poblacion, Maco, Davao de Oro";
export const COURT_ADDRESS_FULL = "Poblacion, Maco, Davao de Oro 8806";
export const COURT_REGION_SHORT = "Maco, Davao de Oro";

const MAP_EMBED_SRC =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3956.932418358037!2d125.85205797452392!3d7.361472692647592!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x32f957002df14b27%3A0x262333ab7ab92999!2sTiffany%E2%80%99s%20Pickleball%20Court!5e0!3m2!1sen!2sph!4v1789370297740!5m2!1sen!2sph";

export function CourtLocation() {
  return (
    <section
      id="location"
      className="scroll-mt-24 border-t border-court-800/10 bg-white py-8 sm:py-12"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-court-700">
          Where to play
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.01em] text-ink-900 sm:text-4xl">
          Find the court
        </h2>

        <p className="mt-3 text-base leading-7 text-ink-500">
          Tiffany&apos;s Pickleball Court · {COURT_ADDRESS_FULL}
        </p>

        <div className="mt-6 overflow-hidden rounded-2xl border border-court-800/15 shadow-[0_10px_30px_rgba(7,52,28,.08)]">
          <iframe
            src={MAP_EMBED_SRC}
            title="Map to Tiffany's Pickleball Court"
            loading="lazy"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="block h-[320px] w-full border-0 sm:h-[420px]"
          />
        </div>
      </div>
    </section>
  );
}
