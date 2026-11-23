"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CELL, ROW, TABLE_FRAME } from "@/components/renewals/layout";
import type { PovListItem } from "@/types/pov";
import { formatDate, localPart } from "./format";
import { MUTED, POV_TABLE, SEG, SEG_ACTIVE, SEG_WRAP, TAB, TAB_ACTIVE, TABS, TH, listColumns, type ListColumn } from "./layout";
import { StatusBadge } from "./status-badge";

type Tab = "active" | "decided" | "all";
type Who = "mine" | "everyone";
const TAB_LABEL: Record<Tab, string> = { active: "Active", decided: "Decided", all: "All" };
const TAB_ORDER: readonly Tab[] = ["active", "decided", "all"];

export function ListFrame({ columns, children }: { columns: ListColumn[]; children: ReactNode }) {
  return (
    <div className={`${TABLE_FRAME} overflow-x-auto`}>
      <table className={POV_TABLE}>
        <colgroup>
          {columns.map((c) => (
            <col key={c.label} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
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

const decisionBy = (pov: PovListItem) => pov.decision_date ?? pov.end_date;

function order(tab: Tab, a: PovListItem, b: PovListItem): number {
  if (tab === "active") {
    // Soonest decision first; plans without a date go last.
    const [x, y] = [decisionBy(a), decisionBy(b)];
    if (x !== y) return x === null ? 1 : y === null ? -1 : x < y ? -1 : 1;
  }
  return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
}

function emptyText(tab: Tab, who: Who): [title: string, hint: string | null] {
  const start = "Add a title and prospect name above to start";
  if (tab === "active") return who === "mine" ? ["You have no PoVs in flight.", `${start} one.`] : ["No PoVs in flight.", `${start} the first one.`];
  if (tab === "decided") return [who === "mine" ? "None of your PoVs has reached a decision yet." : "No PoV has reached a decision yet.", null];
  return [who === "mine" ? "You have no PoV plans yet" : "No PoV plans yet", `${start} the first one.`];
}

export function PovListView({ povs, viewer }: { povs: PovListItem[]; viewer: string | null }) {
  const [tab, setTab] = useState<Tab>("active");
  // "Mine" needs to know who is looking; without that, show everyone's.
  const [who, setWho] = useState<Who>(viewer ? "mine" : "everyone");
  const columns = listColumns(who === "everyone");

  const rows = povs
    .filter((p) => (tab === "all" ? true : tab === "decided" ? p.status === "decided" : p.status !== "decided"))
    .filter((p) => who === "everyone" || p.owner_email.trim().toLowerCase() === viewer)
    .sort((a, b) => order(tab, a, b));
  const [emptyTitle, emptyHint] = emptyText(tab, who);

  return (
    <>
      <div className={TABS}>
        <div role="group" aria-label="Which plans to show" className="flex items-center gap-5">
          {TAB_ORDER.map((t) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={tab === t ? TAB_ACTIVE : TAB}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        {viewer ? (
          <div role="group" aria-label="Whose plans to show" className={`${SEG_WRAP} mb-1 ml-auto`}>
            {(["mine", "everyone"] as const).map((w) => (
              <button key={w} type="button" aria-pressed={who === w} onClick={() => setWho(w)} className={who === w ? SEG_ACTIVE : SEG}>
                {w === "mine" ? "Mine" : "Everyone"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <ListFrame columns={columns}>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="h-40 px-3 text-center align-middle">
              <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{emptyTitle}</p>
              {emptyHint ? <p className={`mt-1 text-xs ${MUTED}`}>{emptyHint}</p> : null}
            </td>
          </tr>
        ) : (
          rows.map((pov) => (
            <tr key={pov.pov_id} className={`${ROW} hover:bg-zinc-50 dark:hover:bg-zinc-900/60`}>
              <td className={CELL}>
                <Link
                  href={`/pov/${pov.pov_id}`}
                  className="block truncate font-medium text-zinc-900 hover:underline focus-visible:outline-2 focus-visible:outline-zinc-400 dark:text-zinc-100"
                >
                  {pov.title}
                </Link>
                <span className={`block truncate text-xs ${MUTED}`}>{pov.prospect_name}</span>
              </td>
              <td className={CELL}>
                <StatusBadge status={pov.status} decision={pov.decision} />
              </td>
              <td className={`${CELL} tabular-nums`}>{decisionBy(pov) ? formatDate(decisionBy(pov)) : <span className={MUTED}>Not set</span>}</td>
              {who === "everyone" ? (
                <td className={`${CELL} truncate`} title={pov.owner_email}>
                  {localPart(pov.owner_email)}
                </td>
              ) : null}
              <td className={`${CELL} text-right tabular-nums ${MUTED}`}>{formatDate(pov.updated_at)}</td>
            </tr>
          ))
        )}
      </ListFrame>
    </>
  );
}
