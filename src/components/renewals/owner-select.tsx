"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Owner, RenewalWindow } from "@/types/renewals";
import { renewalsHref } from "./href";
import { CONTROL_H } from "./layout";

// The only client island on the page: owner filter → URL, so views are shareable.
export function OwnerSelect({
  owners,
  value,
  window: renewalWindow,
}: {
  owners: Owner[];
  value: string | null;
  window: RenewalWindow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="inline-flex items-center">
      <span className="sr-only">Owner</span>
      <select
        // Uncontrolled + keyed so the new choice sticks while the route transitions.
        key={value ?? "all"}
        defaultValue={value ?? ""}
        aria-busy={pending}
        onChange={(e) => {
          const owner = e.target.value || null;
          startTransition(() => {
            router.push(renewalsHref({ window: renewalWindow, owner }), { scroll: false });
          });
        }}
        className={`${CONTROL_H} max-w-48 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 ${
          pending ? "opacity-60" : ""
        }`}
      >
        <option value="">All owners</option>
        {owners.map((o) => (
          <option key={o.owner_id} value={o.owner_id}>
            {o.owner_name}
          </option>
        ))}
      </select>
    </label>
  );
}
