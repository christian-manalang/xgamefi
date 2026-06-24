import Link from "next/link";

const links = [
  { href: "/dashboard/items", label: "ITEMS" },
  { href: "/dashboard/builder", label: "BUILDER" },
];

export function SideRail({ current }: { current?: string }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-2 border-r-2 border-outline-variant bg-surface-container-lowest p-4">
      {links.map(({ href, label }) => {
        const active = current === href;
        return (
          <Link
            key={href}
            href={href}
            className={`border-l-4 px-4 py-3 font-mono text-[12px] uppercase tracking-[0.1em] ${
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
