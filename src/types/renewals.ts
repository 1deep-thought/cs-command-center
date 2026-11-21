// Mirror of api/_lib/models.py — keep in lockstep (CLAUDE.md: Schema Parity).
// Dates are ISO strings ("YYYY-MM-DD") on the wire.

export type Source = "Gong" | "Telemetry" | "HubSpot" | "WisdomAI";

export interface SourceRef {
  source: Source;
  ref_label: string;
  start_date: string | null;
  end_date: string | null;
  record_id: string | null;
  url: string | null;
}

export type RiskDriverCode =
  | "CHURN_INTENT"
  | "URGENT_TICKETS"
  | "USAGE_DROP"
  | "NO_CUSTOMER_CALL"
  | "RISK_MENTION"
  | "LOW_SEAT_UTILIZATION"
  | "NO_EXEC_CALL"
  | "UNRESOLVED_QUESTIONS"
  | "KEY_FEATURE_UNADOPTED";

export interface RiskDriver {
  code: RiskDriverCode;
  severity: number;
  label: string;
  source_refs: SourceRef[];
}

export type RenewalWindow = "next_90d" | "days_91_180";

export interface RenewalsKpiSummary {
  as_of_date: string;
  window: RenewalWindow;
  owner_filter: string | null;
  account_count: number;
  arr_renewing_usd: number;
  arr_renewing_delta_30d_usd: number | null;
  arr_at_risk_usd: number;
  arr_at_risk_pct: number;
  arr_at_risk_delta_30d_usd: number | null;
  forecast_grr_pct: number;
  forecast_retained_arr_usd: number;
  forecast_grr_delta_30d_pts: number | null;
  unworked_at_risk_arr_usd: number;
  unworked_at_risk_arr_delta_30d_usd: number | null;
  probability_config_version: string;
}

export type HealthBand = "healthy" | "watch" | "at_risk" | "insufficient_data";

export type DataGap =
  | "telemetry_lt_30d"
  | "telemetry_lt_60d"
  | "seat_count_missing"
  | "gong_unmapped"
  | "gong_new_account"
  | "telemetry_unmapped"
  | "tickets_unavailable"
  | "renewal_date_missing";

export type HealthComponent =
  | "seat_utilization"
  | "usage_trend"
  | "relationship"
  | "key_feature_adoption"
  | "support_friction";

export interface AccountRenewalRow {
  account_id: string;
  account_name: string;
  plan: string;
  owner_id: string;
  owner_name: string;
  arr_usd: number;
  arr_delta_30d_usd: number | null;
  renewal_date: string;
  days_to_renewal: number;
  is_past_due: boolean;
  health_score: number | null;
  health_band: HealthBand;
  band_overridden: boolean;
  health_score_delta_30d: number | null;
  seat_utilization_pct: number | null;
  seat_utilization_delta_30d_pts: number | null;
  wau: number | null;
  licensed_seats: number | null;
  usage_trend_pct: number | null;
  days_since_customer_call: number | null;
  days_since_exec_call: number | null;
  last_customer_call_ref: SourceRef | null;
  last_customer_call_is_exec: boolean;
  risk_drivers: RiskDriver[];
  data_gaps: DataGap[];
  component_scores: Record<HealthComponent, number | null>;
}

export interface Owner {
  owner_id: string;
  owner_name: string;
}

export interface RenewalsResponse {
  data_source: "bigquery" | "mock";
  summary: RenewalsKpiSummary;
  accounts: AccountRenewalRow[];
  owners: Owner[];
}
