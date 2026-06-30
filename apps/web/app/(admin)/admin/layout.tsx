import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNavLink } from "./_components/admin-nav-link";
import { LogoutButton } from "./_components/logout-button";

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
      <header className="h-20 border-b-2 border-primary flex items-center justify-between px-16">
        <div className="flex items-center gap-4">
          <span className="font-display italic text-2xl">xGameFi</span>
          <span className="font-mono text-xs tracking-[0.1em] text-on-surface-variant">ADMIN CONSOLE</span>
        </div>
        <LogoutButton />
      </header>
      <div className="flex">
        <nav className="w-64 border-r-2 border-outline-variant min-h-[calc(100vh-5rem)] py-6">
          {NAV.map((n) => (
            <AdminNavLink key={n.href} href={n.href} label={n.label} />
          ))}
        </nav>
        <main className="flex-1 px-16 py-8">{children}</main>
      </div>
    </div>
  );
}
