import Link from "next/link";
import type { RenewalWindow } from "@/types/renewals";
import { WINDOWS, WINDOW_LABEL, renewalsHref } from "./href";
import { RenewalsTableFrame } from "./renewals-table";

export function RenewalsEmpty({
  window: renewalWindow,
  owner,
  ownerName,
}: {
  window: RenewalWindow;
  owner: string | null;
  ownerName: string | null;
}) {
  const other = WINDOWS.find((w) => w !== renewalWindow) ?? renewalWindow;
  const link =
    "text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-zinc-100";

  return (
    <RenewalsTableFrame>
      <tr>
        <td colSpan={8} className="h-40 px-3 text-center align-middle">
          <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
            No open renewals in {WINDOW_LABEL[renewalWindow].toLowerCase()}
            {ownerName ? ` for ${ownerName}` : ""}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Includes past-due renewals still open.{" "}
            <Link href={renewalsHref({ window: other, owner })} scroll={false} className={link}>
              View {WINDOW_LABEL[other]}
            </Link>
            {owner ? (
              <>
                {" · "}
                <Link
                  href={renewalsHref({ window: renewalWindow, owner: null })}
                  scroll={false}
                  className={link}
                >
                  All owners
                </Link>
              </>
            ) : null}
          </p>
        </td>
      </tr>
    </RenewalsTableFrame>
  );
}
