import Link from "next/link";
import type { RenewalWindow } from "@/types/renewals";
import { WINDOWS, WINDOW_LABEL, renewalsHref } from "./href";
import { CONTROL_H } from "./layout";

export function WindowToggle({
  current,
  owner,
}: {
  current: RenewalWindow;
  owner: string | null;
}) {
  return (
    <nav
      aria-label="Renewal window"
      className={`inline-flex ${CONTROL_H} items-center rounded-md border border-zinc-200 p-0.5 dark:border-zinc-800`}
    >
      {WINDOWS.map((w) => {
        const active = w === current;
        return (
          <Link
            key={w}
            href={renewalsHref({ window: w, owner })}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={`flex h-full items-center rounded-[5px] px-2.5 text-xs whitespace-nowrap focus-visible:outline-2 focus-visible:outline-zinc-400 ${
              active
                ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {WINDOW_LABEL[w]}
          </Link>
        );
      })}
    </nav>
  );
}
