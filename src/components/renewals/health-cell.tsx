import type { AccountRenewalRow } from "@/types/renewals";
import { BandBadge } from "./band-badge";
import { DASH, TONE_TEXT, deltaTone, formatScoreDelta, isNum } from "./format";
import { HoverCard } from "./hover-card";
import { COMPONENT_LABEL, COMPONENT_ORDER, GAP_LABEL } from "./labels";

export function HealthCell({ row }: { row: AccountRenewalRow }) {
  const insufficient = row.health_band === "insufficient_data";
  const score = isNum(row.health_score) ? row.health_score : null;
  const delta = row.health_score_delta_30d;
  // Table restraint: only a decline earns color; improvements stay neutral.
  const tone = deltaTone(delta, "up");

  const trigger = (
    <span className="flex items-center gap-1.5 tabular-nums">
      {insufficient ? null : (
        <span className="w-6 text-right font-medium text-zinc-900 dark:text-zinc-100">
          {score ?? DASH}
        </span>
      )}
      <BandBadge band={row.health_band} overridden={row.band_overridden} />
      {insufficient ? null : (
        <span
          className={`text-xs ${TONE_TEXT[tone === "good" ? "neutral" : tone]}`}
          title={isNum(delta) ? "vs 30d snapshot" : "New: no snapshot 30 days ago"}
        >
          {formatScoreDelta(delta)}
        </span>
      )}
    </span>
  );

  return (
    <HoverCard
      id={`health-${row.account_id}`}
      trigger={trigger}
    >
      <span className="flex items-baseline justify-between font-medium text-zinc-900 dark:text-zinc-100">
        <span>{insufficient ? "Insufficient data" : `Health ${score ?? DASH} / 100`}</span>
        <span className="tabular-nums text-zinc-500">
          {isNum(delta) ? `${formatScoreDelta(delta)} vs 30d` : "New"}
        </span>
      </span>
      {row.band_overridden ? (
        <span className="mt-1 block text-rose-700 dark:text-rose-400">
          Band forced to At Risk: churn intent on a call in the last 90d.
        </span>
      ) : null}
      <span className="mt-2 block border-t border-zinc-100 pt-2 dark:border-zinc-800">
        {COMPONENT_ORDER.map((c) => {
          const v = row.component_scores[c];
          return (
            <span key={c} className="flex justify-between py-0.5">
              <span className="text-zinc-500 dark:text-zinc-400">{COMPONENT_LABEL[c]}</span>
              <span className="tabular-nums">{isNum(v) ? v : DASH}</span>
            </span>
          );
        })}
      </span>
      {row.data_gaps.length > 0 ? (
        <span className="mt-2 block border-t border-zinc-100 pt-2 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Data gaps:{row.data_gaps.map((g) => GAP_LABEL[g]).join(", ")}
        </span>
      ) : null}
    </HoverCard>
  );
}
