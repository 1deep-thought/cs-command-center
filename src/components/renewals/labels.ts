import type { DataGap, HealthBand, HealthComponent } from "@/types/renewals";

export const BAND_LABEL: Record<HealthBand, string> = {
  healthy: "Healthy",
  watch: "Watch",
  at_risk: "At Risk",
  insufficient_data: "Insufficient data",
};

// Semantic color only: emerald / amber / rose for status, zinc for "can't tell".
export const BAND_BADGE: Record<HealthBand, string> = {
  healthy:
    "border-emerald-600/20 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-400",
  watch:
    "border-amber-600/25 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-400",
  at_risk:
    "border-rose-600/20 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-400",
  insufficient_data:
    "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400",
};

export const GAP_LABEL: Record<DataGap, string> = {
  telemetry_lt_30d: "telemetry < 30d",
  telemetry_lt_60d: "telemetry < 60d",
  seat_count_missing: "seat count missing",
  gong_unmapped: "Gong not mapped",
  gong_new_account: "new account, no Gong calls",
  telemetry_unmapped: "telemetry not mapped",
  tickets_unavailable: "ticket sync unavailable",
  renewal_date_missing: "renewal date missing",
};

export const COMPONENT_ORDER: readonly HealthComponent[] = [
  "seat_utilization",
  "usage_trend",
  "relationship",
  "key_feature_adoption",
  "support_friction",
];

export const COMPONENT_LABEL: Record<HealthComponent, string> = {
  seat_utilization: "Seat utilization",
  usage_trend: "Usage trend",
  relationship: "Relationship",
  key_feature_adoption: "Key feature adoption",
  support_friction: "Support friction",
};
