// Shapes returned by /api/py/accounts (api/accounts_routes.py, api/_lib/accounts_bq.py).
// The API passes BigQuery rows through as they are, so every field here names a column the
// queries select. Change the SQL and this file together.

export type HealthBand = "green" | "yellow" | "red";
type N = number | null;
type S = string | null;

export interface AccountSignal {
  signal_id: string;
  label: string;
  severity: "red" | "amber";
  detail: string;
  /** Only on the Account 360. */
  play?: string;
}

/** One row of the account book. */
export interface AccountRow {
  account_id: string;
  account_name: string;
  primary_domain: S;
  industry: S;
  segment: S;
  plan_tier: S;
  employee_count: N;
  lifecycle_stage: S;
  csm_owner_email: S;
  ae_owner_email: S;
  renewal_owner_email: S;
  health_score: N;
  health_score_uncapped: N;
  health_band: HealthBand | null;
  health_guardrails: string[] | null;
  health_usage_score: N;
  health_engagement_score: N;
  health_support_score: N;
  arr_usd: N;
  arr_change_30d_usd: N;
  next_renewal_date: S;
  days_to_renewal: N;
  seat_utilization: N;
  active_users_30d: N;
  licensed_seats: N;
  chats_30d: N;
  chats_30d_delta_pct: N;
  open_tickets: N;
  open_high_priority_tickets: N;
  days_since_last_touch: N;
  red_signals: N;
  amber_signals: N;
  data_gaps: N;
  data_completeness: N;
  urgency_score: N;
  snapshot_date: S;
  renewal_stage: S;
  forecast_category: S;
  signals: AccountSignal[];
}

export interface SourceFreshness {
  source: string;
  last_successful_sync_at: S;
  status: string;
}

export interface AccountBook {
  accounts: AccountRow[];
  freshness: SourceFreshness[];
}

/** The account's own row on the 360 (the hero). */
export interface AccountHero {
  account_id: string;
  account_name: string;
  primary_domain: S;
  industry: S;
  segment: S;
  plan_tier: S;
  employee_count: N;
  lifecycle_stage: S;
  csm_owner_email: S;
  ae_owner_email: S;
  renewal_owner_email: S;
  health_score: N;
  health_score_uncapped: N;
  health_band: HealthBand | null;
  health_guardrails: string[] | null;
  arr_usd: N;
  arr_change_30d_usd: N;
  next_renewal_date: S;
  days_to_renewal: N;
  seat_utilization: N;
  active_users_30d: N;
  licensed_seats: N;
  chats_30d: N;
  chats_30d_delta_pct: N;
  success_rate_30d: N;
  open_tickets: N;
  open_high_priority_tickets: N;
  last_csm_touch_at: S;
  last_product_activity_at: S;
  telemetry_level: S;
}

export interface HealthComponentRow {
  component: string;
  metric: string;
  metric_label: string;
  value: N;
  score: N;
  weight: number;
  contribution_points: number;
  points_available: number;
  improve_hint: S;
}
export interface HealthTrendRow {
  snapshot_date: string;
  health_score: number;
  health_score_uncapped: number;
  health_band: S;
}
export interface UsageRow {
  activity_date: string;
  dau: N;
  wau: N;
  mau: N;
  chats: N;
  success_rate: N;
  thumbs_up: N;
  thumbs_down: N;
  slack_chats: N;
  mcp_chats: N;
  research_runs: N;
  workflow_runs: N;
  knowledge_edits: N;
}
export interface DomainRow {
  instance_id: string;
  environment: S;
  domain_name: string;
  item_count: N;
  approved_item_count: N;
  coverage_pct: N;
  validation_match_pct: N;
  eval_pass_rate: N;
  open_gaps: N;
  open_inbox_issues: N;
  tables_in_warehouse: N;
  tables_documented: N;
  edits_7d: N;
  last_edit_at: S;
  readiness: S;
}
export interface DealRow {
  deal_id: string;
  dealname: S;
  stage: S;
  dealtype: S;
  is_open: boolean | null;
  arr_usd: N;
  close_date: S;
  contract_start_date: S;
  contract_end_date: S;
  forecast_category: S;
  owner_email: S;
  contract_status: S;
  hubspot_url: S;
}
export interface GapRow {
  check_id: string;
  check_label: string;
  status: "pass" | "fail" | "skipped" | (string & {});
  fix_hint: S;
  hubspot_url: S;
}
export interface PersonRow {
  name: S;
  title: S;
  contact_role: S;
  last_call_at: S;
  last_ticket_at: S;
  chats_30d: N;
  last_product_activity_at: S;
}
export interface CallRow {
  call_started_at: S;
  title: S;
  summary: S;
  sentiment: S;
  themes: string[] | null;
  competitor_mentions: string[] | null;
  source_url: S;
}
export interface TimelineRow {
  event_at: S;
  source: string;
  event_type: S;
  title: S;
  internal_owner_email: S;
  source_url: S;
}
export interface ArrMovementRow {
  movement_date: S;
  movement_type: S;
  arr_before_usd: N;
  arr_after_usd: N;
  delta_usd: N;
}

/** GET /api/py/accounts/{id}: everything the Account 360 shows. */
export interface AccountDetail {
  book: AccountHero;
  signals: AccountSignal[];
  components: HealthComponentRow[];
  health_trend: HealthTrendRow[];
  usage: UsageRow[];
  domains: DomainRow[];
  deals: DealRow[];
  gaps: GapRow[];
  people: PersonRow[];
  calls: CallRow[];
  timeline: TimelineRow[];
  arr: ArrMovementRow[];
}
