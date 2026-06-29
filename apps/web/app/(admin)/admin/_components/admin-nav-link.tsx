"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`block px-6 py-3 font-mono text-xs tracking-[0.1em] border-l-4 transition-colors ${
        active
          ? "border-secondary bg-primary text-on-primary"
          : "border-transparent hover:text-primary-fixed hover:border-primary-fixed"
      }`}
    >
      {label}
    </Link>
  );
}
