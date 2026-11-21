import type { AccountRenewalRow } from "@/types/renewals";
import {
  DASH,
  TONE_TEXT,
  type GoodDirection,
  type Tone,
  deltaTone,
  formatCount,
  formatDateShort,
  formatDays,
  formatPct,
  formatPctSigned,
  formatPtsSigned,
  formatUsdCompact,
  formatUsdSigned,
  isNum,
} from "./format";

// In-table deltas: only a bad move earns color; good moves stay neutral.
function rowTone(v: number | null | undefined, good: GoodDirection): Tone {
  const t = deltaTone(v, good);
  return t === "good" ? "neutral" : t;
}

const SUB = "block h-4 text-xs leading-4 text-zinc-500 dark:text-zinc-400";
const PRIMARY = "block h-5 leading-5 tabular-nums text-zinc-900 dark:text-zinc-100";

export function AccountCell({ row }: { row: AccountRenewalRow }) {
  return (
    <div className="min-w-0">
      <span
        className="block h-5 truncate leading-5 font-medium text-zinc-900 dark:text-zinc-100"
        title={row.account_name}
      >
        {row.account_name}
      </span>
      <span className={`${SUB} truncate`}>
        {row.plan} · {row.owner_name}
      </span>
    </div>
  );
}

export function ArrCell({ row }: { row: AccountRenewalRow }) {
  const d = row.arr_delta_30d_usd;
  const changed = isNum(d) && Math.round(d) !== 0;
  return (
    <div>
      <span className={PRIMARY}>{formatUsdCompact(row.arr_usd)}</span>
      <span
        className={`${SUB} tabular-nums ${changed ? TONE_TEXT[rowTone(d, "up")] : ""}`}
        title={changed ? "vs ARR 30d ago" : undefined}
      >
        {changed ? formatUsdSigned(d) : null}
      </span>
    </div>
  );
}

export function RenewalCell({ row }: { row: AccountRenewalRow }) {
  const date = formatDateShort(row.renewal_date);
  if (row.is_past_due) {
    return (
      <div>
        <span className="flex h-5 items-center">
          <span className="inline-flex h-5 items-center rounded border border-rose-600/20 bg-rose-50 px-1.5 text-[11px] leading-none font-medium whitespace-nowrap text-rose-700 tabular-nums dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-400">
            Past due {formatDays(Math.abs(row.days_to_renewal))}
          </span>
        </span>
        <span className={`${SUB} tabular-nums`}>{date}</span>
      </div>
    );
  }
  return (
    <span className="whitespace-nowrap tabular-nums text-zinc-900 dark:text-zinc-100">
      {date}
      <span className="text-zinc-500 dark:text-zinc-400"> · {formatDays(row.days_to_renewal)}</span>
    </span>
  );
}

export function SeatsCell({ row }: { row: AccountRenewalRow }) {
  const pct = row.seat_utilization_pct;
  if (!isNum(pct)) {
    const reason = row.data_gaps.includes("seat_count_missing")
      ? "Seat count missing in HubSpot"
      : "Not available";
    return (
      <span className="text-zinc-400 dark:text-zinc-500" title={reason}>
        {DASH}
      </span>
    );
  }
  const d = row.seat_utilization_delta_30d_pts;
  return (
    <div>
      <span className={`${PRIMARY} whitespace-nowrap`} title="WAU / licensed seats">
        {formatPct(pct)}
        <span className="text-zinc-500 dark:text-zinc-400">
          {" "}
          · {formatCount(row.wau)}/{formatCount(row.licensed_seats)}
        </span>
      </span>
      <span
        className={`${SUB} tabular-nums ${TONE_TEXT[rowTone(d, "up")]}`}
        title={isNum(d) ? "vs 30d ago" : "No snapshot 30 days ago"}
      >
        {formatPtsSigned(d, 0)}
      </span>
    </div>
  );
}

export function UsageCell({ row }: { row: AccountRenewalRow }) {
  const r = row.usage_trend_pct;
  return (
    <span
      className={`tabular-nums ${isNum(r) ? TONE_TEXT[rowTone(r, "up")] : TONE_TEXT.muted}`}
      title={
        isNum(r)
          ? "Active user-days, last 30d vs prior 30d"
          : "Not enough telemetry history for a prior 30d window"
      }
    >
      {formatPctSigned(r)}
    </span>
  );
}

export function LastCallCell({ row }: { row: AccountRenewalRow }) {
  const days = row.days_since_customer_call;
  const exec = row.days_since_exec_call;
  const unmapped = row.data_gaps.includes("gong_unmapped");

  if (!isNum(days)) {
    // No call: "Never" is a signal; an unmapped Gong account is a data gap.
    return unmapped ? (
      <span className="text-zinc-400 dark:text-zinc-500" title="Gong not mapped to this account">
        {DASH}
      </span>
    ) : (
      <span className="text-zinc-500 dark:text-zinc-400" title="No customer call on record">
        Never
      </span>
    );
  }

  const wasExec = row.last_customer_call_is_exec;
  const title = [
    `Last customer call: ${row.last_customer_call_ref?.ref_label ?? `${days}d ago`}`,
    `Last exec call: ${isNum(exec) ? `${exec}d ago` : "none on record"}`,
  ].join("\n");
  const content = (
    <>
      {formatDays(days)}
      {wasExec ? (
        <>
          <span aria-hidden="true" className="ml-0.5 text-zinc-500 dark:text-zinc-400">
            ★
          </span>
          <span className="sr-only"> (exec call)</span>
        </>
      ) : null}
    </>
  );
  const url = row.last_customer_call_ref?.url;
  const cls = "tabular-nums whitespace-nowrap text-zinc-900 dark:text-zinc-100";
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`${cls} underline-offset-2 hover:underline`}
    >
      {content}
    </a>
  ) : (
    <span title={title} className={cls}>
      {content}
    </span>
  );
}
