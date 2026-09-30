"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Daily Reports", active: (p: string) => p === "/admin" || p.startsWith("/admin/reports") },
  { href: "/admin/users", label: "User Management", active: (p: string) => p.startsWith("/admin/users") },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    // Scrolls sideways rather than wrapping if the tabs ever outgrow the screen.
    <nav aria-label="Admin sections" className="-mb-px mt-2 flex gap-6 overflow-x-auto">
      {TABS.map((tab) => {
        const active = tab.active(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors max-lg:pb-3 max-lg:pt-2.5 ${
              active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
