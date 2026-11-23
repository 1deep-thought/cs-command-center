import Link from "next/link";
import { NoAccessCard, SignInCard, SignOutButton } from "@/components/auth/sign-in";
import { CELL, HEADER_ROW, ROW, TABLE_FRAME } from "@/components/renewals/layout";
import { AuthRequiredError, NotAuthorizedError } from "@/lib/auth";
import { getPovList } from "@/lib/pov-api";
import type { PovListItem } from "@/types/pov";
import { formatDate, localPart, plural } from "./format";
import { LINK, MUTED, POV_TABLE, SECTION_COUNT, TH } from "./layout";
import { NewPovForm } from "./new-pov-form";
import { StatusBadge } from "./status-badge";

export const LIST_TITLE = "Proof of Value";
export const LIST_COLUMNS = [
  { label: "PoV", width: undefined, align: "text-left" },
  { label: "Status", width: 150, align: "text-left" },
  { label: "Currency", width: 64, align: "text-left" },
  { label: "End date", width: 120, align: "text-left" },
  { label: "Owner", width: 200, align: "text-left" },
  { label: "Updated", width: 110, align: "text-right" },
] as const;

export function ListTitle() {
  return (
    <h1 className="text-[15px] leading-7 font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{LIST_TITLE}</h1>
  );
}

export function ListFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${TABLE_FRAME} overflow-x-auto`}>
      <table className={POV_TABLE}>
        <colgroup>
          {LIST_COLUMNS.map((c) => (
            <col key={c.label} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {LIST_COLUMNS.map((c) => (
              <th key={c.label} scope="col" className={`${TH} ${c.align}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Row({ pov }: { pov: PovListItem }) {
  return (
    <tr className={`${ROW} hover:bg-zinc-50 dark:hover:bg-zinc-900/60`}>
      <td className={CELL}>
        <Link href={`/pov/${pov.pov_id}`} className="block truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100">
          {pov.title}
        </Link>
        <span className={`block truncate text-xs ${MUTED}`}>{pov.prospect_name}</span>
      </td>
      <td className={CELL}>
        <StatusBadge status={pov.status} decision={pov.decision} />
      </td>
      <td className={`${CELL} ${MUTED}`}>{pov.currency}</td>
      <td className={`${CELL} tabular-nums`}>{formatDate(pov.end_date)}</td>
      <td className={`${CELL} truncate`} title={pov.owner_email}>
        {localPart(pov.owner_email)}
      </td>
      <td className={`${CELL} text-right tabular-nums ${MUTED}`}>{formatDate(pov.updated_at)}</td>
    </tr>
  );
}

// Async server component: uncached API fetch, so it must render inside <Suspense>.
export async function PovList() {
  let povs: PovListItem[];
  try {
    povs = await getPovList();
  } catch (error) {
    if (error instanceof AuthRequiredError) return <SignInCard expired={error.expired} />;
    if (error instanceof NotAuthorizedError) return <NoAccessCard />;
    throw error;
  }
  return (
    <>
      <header className={HEADER_ROW}>
        <div className="flex items-center gap-2.5">
          <ListTitle />
          <span className={SECTION_COUNT}>{plural(povs.length, "plan")}</span>
        </div>
        <NewPovForm />
      </header>
      <ListFrame>
        {povs.length === 0 ? (
          <tr>
            <td colSpan={LIST_COLUMNS.length} className="h-40 px-3 text-center align-middle">
              <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">No PoV plans yet</p>
              <p className={`mt-1 text-xs ${MUTED}`}>Add a title and prospect name above to start the first one.</p>
            </td>
          </tr>
        ) : (
          povs.map((pov) => <Row key={pov.pov_id} pov={pov} />)
        )}
      </ListFrame>
      <div className="flex h-4 items-center justify-between gap-3">
        <Link href="/" className={`text-[11px] leading-4 ${LINK}`}>
          Health &amp; Renewals
        </Link>
        <SignOutButton variant="link" />
      </div>
    </>
  );
}
