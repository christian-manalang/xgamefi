import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/admin", label: "OVERVIEW" },
  { href: "/admin/studios", label: "STUDIOS" },
  { href: "/admin/users", label: "USERS" },
  { href: "/admin/transactions", label: "LEDGER" },
  { href: "/admin/settings", label: "SETTINGS" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  try {
    await requireRole("ADMIN");
  } catch {
    redirect("/login");
  }
  return (
    <div className="min-h-screen bg-background text-on-background">
      <header className="h-20 border-b-2 border-primary flex items-center px-16">
        <span className="font-display italic text-2xl">xGameFi</span>
        <span className="ml-4 font-mono text-xs tracking-[0.1em] text-on-surface-variant">ADMIN CONSOLE</span>
      </header>
      <div className="flex">
        <nav className="w-64 border-r-2 border-outline-variant min-h-[calc(100vh-5rem)] py-6">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="block px-6 py-3 font-mono text-xs tracking-[0.1em] hover:text-primary-fixed"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 px-16 py-8">{children}</main>
      </div>
    </div>
  );
}
