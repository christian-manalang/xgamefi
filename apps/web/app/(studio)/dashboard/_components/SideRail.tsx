"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "OVERVIEW" },
  { href: "/dashboard/items", label: "ITEMS" },
  { href: "/dashboard/builder", label: "BUILDER" },
  { href: "/dashboard/promotions", label: "PROMOTIONS" },
  { href: "/dashboard/referrals", label: "REFERRALS" },
  { href: "/dashboard/settings", label: "SETTINGS" },
];

export function SideRail() {
  const pathname = usePathname();
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-2 border-r-2 border-outline-variant bg-surface-container-lowest p-4">
      {links.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`border-l-4 px-4 py-3 font-mono text-[12px] uppercase tracking-[0.1em] transition-colors ${
              active
                ? "border-secondary bg-primary text-on-primary"
                : "border-transparent text-on-surface hover:border-primary-fixed"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </aside>
  );
}
