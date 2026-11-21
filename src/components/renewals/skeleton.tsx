import type { ReactNode } from "react";
import { COLUMNS, alignClass } from "./columns";
import { PageTitle } from "./header";
import {
  CELL,
  CONTROL_H,
  HEADER_ROW,
  KPI_CELL,
  KPI_FOOT,
  KPI_GRID,
  KPI_LABEL,
  KPI_VALUE,
  ROW,
  SKELETON_BLOCK,
} from "./layout";
import { RenewalsTableFrame } from "./renewals-table";

const ROWS = 10;

function Block({ className }: { className: string }) {
  return <span className={`block ${SKELETON_BLOCK} ${className}`} />;
}

// Per-column placeholder shapes matching the real cell layout (two-line vs one-line).
const CELL_SHAPE: Record<(typeof COLUMNS)[number]["key"], ReactNode> = {
  account: (
    <>
      <Block className="my-1 h-3 w-36" />
      <Block className="mt-1.5 h-2.5 w-24" />
    </>
  ),
  arr: (
    <>
      <Block className="my-1 ml-auto h-3 w-10" />
      <Block className="mt-1.5 ml-auto h-2.5 w-8" />
    </>
  ),
  renewal: <Block className="h-3 w-20" />,
  health: <Block className="h-5 w-24" />,
  seats: (
    <>
      <Block className="my-1 ml-auto h-3 w-20" />
      <Block className="mt-1.5 ml-auto h-2.5 w-10" />
    </>
  ),
  usage: <Block className="ml-auto h-3 w-8" />,
  call: <Block className="ml-auto h-3 w-7" />,
  drivers: (
    <span className="flex gap-1">
      <Block className="h-5 w-32" />
      <Block className="h-5 w-24" />
    </span>
  ),
};

export function RenewalsHeaderSkeleton() {
  return (
    <div className={HEADER_ROW} aria-hidden="true">
      <div className="flex items-center gap-2.5">
        <PageTitle />
        <Block className="h-3 w-24" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Block className={`${CONTROL_H} w-[186px] rounded-md`} />
        <Block className={`${CONTROL_H} w-28 rounded-md`} />
      </div>
    </div>
  );
}

export function KpiStripSkeleton() {
  return (
    <div className={KPI_GRID} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={KPI_CELL}>
          <span className={KPI_LABEL}>
            <Block className="mt-0.5 h-3 w-24" />
          </span>
          <span className={`${KPI_VALUE} flex items-center`}>
            <Block className="h-6 w-20" />
          </span>
          <span className={KPI_FOOT}>
            <Block className="h-3 w-36" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function RenewalsTableSkeleton() {
  return (
    <RenewalsTableFrame>
      {Array.from({ length: ROWS }, (_, r) => (
        <tr key={r} className={ROW}>
          {COLUMNS.map((c) => (
            <td key={c.key} className={`${CELL} ${alignClass(c.align)}`}>
              {CELL_SHAPE[c.key]}
            </td>
          ))}
        </tr>
      ))}
    </RenewalsTableFrame>
  );
}

/** Data-dependent part of the page (KPIs + table + footer). */
export function RenewalsBodySkeleton() {
  return (
    <>
      <KpiStripSkeleton />
      <RenewalsTableSkeleton />
      <span className="flex h-4 items-center">
        <Block className="h-2.5 w-80" />
      </span>
    </>
  );
}

export function RenewalsPageSkeleton() {
  return (
    <div role="status" aria-label="Loading renewals" className="contents">
      <RenewalsHeaderSkeleton />
      <RenewalsBodySkeleton />
    </div>
  );
}
