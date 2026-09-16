type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
};

export function MetricCard({
  label,
  value,
  detail,
  accent = false,
}: MetricCardProps) {
  return (
    <article
      className={`rounded-2xl border p-5 ${
        accent
          ? "border-court-800 bg-court-800 text-white"
          : "border-court-800/10 bg-white text-ink-900"
      }`}
    >
      <p
        className={`text-[11px] font-bold uppercase tracking-[0.16em] ${
          accent ? "text-gold-200" : "text-ink-500"
        }`}
      >
        {label}
      </p>
      <p className="mt-3 font-display text-4xl font-bold leading-none">
        {value}
      </p>
      <p className={`mt-2 text-sm ${accent ? "text-white/65" : "text-ink-500"}`}>
        {detail}
      </p>
    </article>
  );
}
