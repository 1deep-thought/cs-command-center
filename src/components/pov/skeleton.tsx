import { CELL, HEADER_ROW, KPI_CELL, ROW, SKELETON_BLOCK, TABLE_FRAME } from "@/components/renewals/layout";
import { ListTitle } from "./list";
import { ListFrame } from "./list-view";
import { ROW_SM, SECTIONS, SECTION_HEAD, SECTION_TITLE, STICKY_HEAD, TABS, TH, listColumns } from "./layout";

const COLUMNS = listColumns(false); // the default view is "Mine", which has no Owner column

function Block({ className }: { className: string }) {
  return <span className={`block ${SKELETON_BLOCK} ${className}`} />;
}

export function PovListSkeleton() {
  return (
    <div className="contents" aria-busy="true" aria-label="Loading PoV plans">
      <div className={HEADER_ROW}>
        <ListTitle />
        <div className="ml-auto flex items-center gap-2">
          <Block className="h-7 w-56" />
          <Block className="h-7 w-44" />
          <Block className="h-7 w-20" />
        </div>
      </div>
      <div className={TABS}>
        <Block className="mb-2 h-3 w-40" />
        <Block className="mb-1 ml-auto h-7 w-28" />
      </div>
      <ListFrame columns={COLUMNS}>
        {Array.from({ length: 8 }, (_, i) => (
          <tr key={i} className={ROW}>
            <td className={CELL}>
              <Block className="h-3 w-48" />
              <Block className="mt-1.5 h-2.5 w-28" />
            </td>
            <td className={CELL}>
              <Block className="h-5 w-20" />
            </td>
            <td className={CELL}>
              <Block className="h-3 w-20" />
            </td>
            <td className={CELL}>
              <Block className="ml-auto h-3 w-16" />
            </td>
          </tr>
        ))}
      </ListFrame>
    </div>
  );
}

function SectionSkeleton({ title, rows, rowClass, footer = false }: { title: string; rows: number; rowClass: string; footer?: boolean }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className={SECTION_HEAD}>
        <h2 className={SECTION_TITLE}>{title}</h2>
      </div>
      <div className={TABLE_FRAME}>
        <div className={TH} />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={`${rowClass} flex items-center gap-6 px-3`}>
            <Block className="h-3 w-48" />
            <Block className="h-3 w-24" />
            <Block className="h-3 w-16" />
          </div>
        ))}
        {footer ? <div className="h-9 border-t border-zinc-100 dark:border-zinc-800/70" /> : null}
      </div>
    </section>
  );
}

export function PovPlanSkeleton() {
  return (
    <div className="contents" aria-busy="true" aria-label="Loading the plan">
      <div className={STICKY_HEAD}>
        <div className={HEADER_ROW}>
          <Block className="h-3 w-56" />
          <div className="ml-auto flex items-center gap-2">
            <Block className="h-7 w-36" />
            <Block className="h-7 w-36" />
          </div>
        </div>
        <Block className="mt-2.5 mb-1 h-3 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 lg:grid-cols-[2fr_1fr_1fr] dark:border-zinc-800 dark:bg-zinc-800">
        {[0, 1, 2].map((i) => (
          <div key={i} className={KPI_CELL}>
            <Block className="h-4 w-28" />
            <Block className="mt-1 h-8 w-32" />
            <Block className="mt-1 h-4 w-40" />
          </div>
        ))}
      </div>
      <div className={SECTIONS}>
        <SectionSkeleton title="Pain points" rows={3} rowClass={ROW} />
        <SectionSkeleton title="Success criteria" rows={3} rowClass={ROW} footer />
        <SectionSkeleton title="Stakeholders" rows={3} rowClass={ROW_SM} />
        <SectionSkeleton title="Timeline" rows={4} rowClass={ROW_SM} />
      </div>
    </div>
  );
}
