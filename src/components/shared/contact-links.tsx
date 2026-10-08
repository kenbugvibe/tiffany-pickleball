import { CONTACT } from "@/lib/contact";

const linkClass =
  "inline-flex min-h-11 items-center gap-2 rounded-xl border border-court-800/15 bg-white px-4 text-sm font-semibold text-court-800 transition hover:border-gold-500";

/** Call, email, and Facebook buttons for Tiffany's Pickleball Court. */
export function ContactLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <a href={CONTACT.phoneHref} className={linkClass}>
        <span aria-hidden="true">📞</span>
        {CONTACT.phoneDisplay}
      </a>
      <a href={`mailto:${CONTACT.email}`} className={`${linkClass} break-all`}>
        <span aria-hidden="true">✉️</span>
        {CONTACT.email}
      </a>
      <a
        href={CONTACT.facebookUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        <span aria-hidden="true">💬</span>
        Facebook page
      </a>
    </div>
  );
}
