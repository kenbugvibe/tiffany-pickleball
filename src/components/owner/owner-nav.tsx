"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/owner/today", label: "Today" },
  { href: "/owner/calendar", label: "Calendar" },
  { href: "/owner/money", label: "Money" },
];

export function OwnerNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1" aria-label="Owner navigation">
      {links.map((link) => {
        const active = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold transition sm:px-4 ${
              active
                ? "bg-gold-500 text-court-950"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
