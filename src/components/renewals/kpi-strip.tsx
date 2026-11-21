import type { RenewalsKpiSummary } from "@/types/renewals";
import {
  DASH,
  TONE_TEXT,
  type Tone,
  deltaTone,
  formatPct,
  formatPtsSigned,
  formatUsdCompact,
  formatUsdSigned,
  isNum,
  pluralize,
} from "./format";
import { KPI_CELL, KPI_FOOT, KPI_GRID, KPI_LABEL, KPI_VALUE } from "./layout";

function Kpi({
  label,
  labelTitle,
  value,
  sub,
  delta,
  tone,
}: {
  label: string;
  labelTitle?: string;
  value: string;
  sub: string;
  delta: string;
  tone: Tone;
}) {
  const hasDelta = delta !== DASH;
  return (
    <div className={KPI_CELL}>
      <span className={KPI_LABEL} title={labelTitle}>
        {label}
      </span>
      <span className={KPI_VALUE}>{value}</span>
      <span className={KPI_FOOT}>
        <span className="truncate text-zinc-500 dark:text-zinc-400">{sub}</span>
        <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
          ·
        </span>
        <span
          className={`whitespace-nowrap ${TONE_TEXT[tone]}`}
          title={hasDelta ? undefined : "No snapshot 30 days ago"}
        >
          {delta} <span className="text-zinc-400 dark:text-zinc-500">vs 30d</span>
        </span>
      </span>
    </div>
  );
}

// Exactly the 4 KPIs from spec §3.4, computed by the API over window + owner.
export function KpiStrip({ summary: s }: { summary: RenewalsKpiSummary }) {
  const empty = s.account_count === 0;
  const unworkedShare =
    s.arr_at_risk_usd > 0 ? s.unworked_at_risk_arr_usd / s.arr_at_risk_usd : null;

  return (
    <section aria-label="Renewal KPIs" className={KPI_GRID}>
      <Kpi
        label="ARR renewing"
        value={formatUsdCompact(s.arr_renewing_usd)}
        sub={pluralize(s.account_count, "account")}
        delta={formatUsdSigned(s.arr_renewing_delta_30d_usd)}
        tone={deltaTone(s.arr_renewing_delta_30d_usd, "none")}
      />
      <Kpi
        label="ARR at risk"
        value={formatUsdCompact(s.arr_at_risk_usd)}
        sub={empty ? "of ARR renewing" : `${formatPct(s.arr_at_risk_pct)} of ARR renewing`}
        delta={formatUsdSigned(s.arr_at_risk_delta_30d_usd)}
        tone={deltaTone(s.arr_at_risk_delta_30d_usd, "down")}
      />
      <Kpi
        label="Forecast GRR"
        labelTitle={`Σ(ARR × p_band) / Σ ARR · probability config ${s.probability_config_version}`}
        value={empty ? DASH : formatPct(s.forecast_grr_pct, 1)}
        sub={`${formatUsdCompact(s.forecast_retained_arr_usd)} retained`}
        delta={formatPtsSigned(s.forecast_grr_delta_30d_pts, 1)}
        tone={deltaTone(s.forecast_grr_delta_30d_pts, "up")}
      />
      <Kpi
        label="Unworked at-risk ARR"
        labelTitle="At Risk ARR with no customer call in the last 30d"
        value={formatUsdCompact(s.unworked_at_risk_arr_usd)}
        sub={
          isNum(unworkedShare)
            ? `${formatPct(unworkedShare)} of at-risk, no call 30d`
            : "no customer call in 30d"
        }
        delta={formatUsdSigned(s.unworked_at_risk_arr_delta_30d_usd)}
        tone={deltaTone(s.unworked_at_risk_arr_delta_30d_usd, "down")}
      />
    </section>
  );
}
