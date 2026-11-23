"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// One bar above every page, so Renewals and Proof of Value read as one product. It scrolls
// away with the page (not sticky), which leaves each page's own sticky header at the top.

const ITEMS = [
  { href: "/", label: "Renewals", match: (path: string) => path === "/" },
  { href: "/pov", label: "Proof of Value", match: (path: string) => path === "/pov" || path.startsWith("/pov/") },
] as const;

const ITEM =
  "inline-flex h-7 items-center rounded-md border px-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400";
const IDLE =
  "border-transparent text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
const ACTIVE = "border-zinc-200 bg-white font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

function Bar({ path }: { path: string | null }) {
  return (
    <div className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mx-auto flex h-11 w-full max-w-[1440px] items-center gap-6 px-6">
        <span className="text-[13px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">CS Command Center</span>
        <nav aria-label="Main" className="flex items-center gap-1">
          {ITEMS.map((item) => {
            const active = path !== null && item.match(path);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`${ITEM} ${active ? ACTIVE : IDLE}`}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function AppBar() {
  return <Bar path={usePathname()} />;
}

/** Shown while the current path is not known yet: the same bar with nothing marked active. */
export function AppBarFallback() {
  return <Bar path={null} />;
}
