import { CELL } from "./layout";

// The 8 columns from spec §3.2, in order. Widths are shared with the skeleton.
export const COLUMNS = [
  { key: "account", label: "Account", width: "19%", align: "left" },
  { key: "arr", label: "ARR", width: "7%", align: "right" },
  { key: "renewal", label: "Renewal", width: "10%", align: "left" },
  { key: "health", label: "Health", width: "12%", align: "left" },
  { key: "seats", label: "Seat utilization", width: "11%", align: "right" },
  { key: "usage", label: "Usage trend", width: "7%", align: "right" },
  { key: "call", label: "Last customer call", width: "9%", align: "right" },
  { key: "drivers", label: "Risk drivers", width: "25%", align: "left" },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]["key"];

export function alignClass(align: "left" | "right"): string {
  return align === "right" ? "text-right" : "text-left";
}

export function TableColGroup() {
  return (
    <colgroup>
      {COLUMNS.map((c) => (
        <col key={c.key} style={{ width: c.width }} />
      ))}
    </colgroup>
  );
}

export function TableHead() {
  return (
    <thead>
      <tr className="h-8 border-b border-zinc-200 dark:border-zinc-800">
        {COLUMNS.map((c) => (
          <th
            key={c.key}
            scope="col"
            className={`${CELL} ${alignClass(c.align)} sticky top-0 z-10 bg-white/95 text-[11px] font-medium whitespace-nowrap text-zinc-500 backdrop-blur first:rounded-tl-md last:rounded-tr-md dark:bg-zinc-950/95 dark:text-zinc-400`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}
