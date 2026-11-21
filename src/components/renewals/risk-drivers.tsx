import type { DataGap, RiskDriver } from "@/types/renewals";
import { DASH } from "./format";
import { GAP_LABEL } from "./labels";

const MAX_DRIVERS = 3;

const CHIP =
  "inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded border px-1.5 text-[11px] leading-none whitespace-nowrap";

// Severity 1 = most severe (spec §4). The dot carries the status color so the
// chip text stays neutral and scannable.
function severityDot(severity: number): string {
  if (severity <= 2) return "bg-rose-500";
  if (severity <= 5) return "bg-amber-500";
  return "bg-zinc-400 dark:bg-zinc-500";
}

function describe(d: RiskDriver): string {
  return [d.label, ...d.source_refs.map((r) => r.ref_label)].join("\n");
}

function DriverChip({ driver }: { driver: RiskDriver }) {
  const href = driver.source_refs.find((r) => r.url)?.url ?? null;
  const className = `${CHIP} border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300`;
  const body = (
    <>
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${severityDot(driver.severity)}`} />
      <span className="truncate">{driver.label}</span>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={describe(driver)}
        className={`${className} hover:border-zinc-300 hover:text-zinc-900 dark:hover:border-zinc-600 dark:hover:text-zinc-100`}
      >
        {body}
      </a>
    );
  }
  return (
    <span title={describe(driver)} className={className}>
      {body}
    </span>
  );
}

function GapChip({ gap }: { gap: DataGap }) {
  return (
    <span
      title="Data gap: excluded from scoring, not a customer signal"
      className={`${CHIP} border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400`}
    >
      <span className="truncate">Data gap: {GAP_LABEL[gap]}</span>
    </span>
  );
}

export function RiskDrivers({
  drivers,
  gaps,
}: {
  drivers: RiskDriver[];
  gaps: DataGap[];
}) {
  // API already sorts by severity; don't re-sort.
  const shown = drivers.slice(0, MAX_DRIVERS);
  const overflow = drivers.slice(MAX_DRIVERS);

  if (shown.length === 0 && gaps.length === 0) {
    return <span className="text-zinc-400 dark:text-zinc-500">{DASH}</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 py-0.5">
      {shown.map((d, i) => (
        <DriverChip key={`${d.code}-${i}`} driver={d} />
      ))}
      {overflow.length > 0 ? (
        <span
          title={overflow.map(describe).join("\n\n")}
          className={`${CHIP} border-zinc-200 text-zinc-500 tabular-nums dark:border-zinc-700 dark:text-zinc-400`}
        >
          +{overflow.length}
        </span>
      ) : null}
      {gaps.map((g) => (
        <GapChip key={g} gap={g} />
      ))}
    </div>
  );
}
