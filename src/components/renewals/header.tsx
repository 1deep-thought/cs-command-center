import Link from "next/link";
import type { RenewalsResponse } from "@/types/renewals";
import { formatDateShort } from "./format";
import { HEADER_ROW } from "./layout";
import { OwnerSelect } from "./owner-select";
import { WindowToggle } from "./window-toggle";

export const PAGE_TITLE = "Health & Renewals";

export function PageTitle() {
  return (
    <h1 className="text-[15px] leading-7 font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
      {PAGE_TITLE}
    </h1>
  );
}

export function RenewalsHeader({ data }: { data: RenewalsResponse }) {
  const { summary } = data;
  return (
    <header className={HEADER_ROW}>
      <div className="flex items-center gap-2.5">
        <PageTitle />
        <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
          Data as of {formatDateShort(summary.as_of_date)}
        </span>
        <Link
          href="/pov"
          className="text-xs text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-zinc-100"
        >
          Proof of Value
        </Link>
        {data.data_source === "mock" ? (
          <span className="inline-flex h-5 items-center rounded border border-zinc-200 px-1.5 text-[11px] leading-none text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Mock data
          </span>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <WindowToggle current={summary.window} owner={summary.owner_filter} />
        <OwnerSelect
          owners={data.owners}
          value={summary.owner_filter}
          window={summary.window}
        />
      </div>
    </header>
  );
}
