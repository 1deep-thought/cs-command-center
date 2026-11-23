// Mirrors api/_lib/pov_models.py. Change both together (CLAUDE.md: schema parity).
// Dates are ISO strings: "2026-12-01" for dates, full ISO-8601 for timestamps.

export type PovStatus = "draft" | "collaborating" | "locked" | "decided";
export type PovDecision = "go" | "extend" | "no_go";

export interface PovCreate {
  /** Optional UUID; a retried create with the same op_id returns the PoV already made. */
  op_id?: string | null;
  title: string;
  prospect_name: string;
  prospect_domain?: string | null;
  /** Three-letter uppercase code. Default "USD". */
  currency?: string;
  account_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

/** Only fields present are changed. At least one field besides base_version/op_id. */
export interface PovPatch {
  /** The `version` the editor last saw. */
  base_version: number;
  /** UUID; a retried request with the same op_id is applied once. */
  op_id: string;
  title?: string;
  prospect_name?: string;
  prospect_domain?: string | null;
  account_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  /** 1 to 100; must be strictly greater than no_go_threshold when both are set. */
  go_threshold?: number | null;
  no_go_threshold?: number | null;
}

export interface PovOwnerView {
  pov_id: string;
  title: string;
  prospect_name: string;
  prospect_domain: string | null;
  status: PovStatus;
  decision: PovDecision | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  baseline_end_date: string | null;
  go_threshold: number | null;
  no_go_threshold: number | null;
  owner_email: string;
  account_id: string | null;
  seq: number;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface PovListItem {
  pov_id: string;
  title: string;
  prospect_name: string;
  status: PovStatus;
  decision: PovDecision | null;
  currency: string;
  end_date: string | null;
  owner_email: string;
  version: number;
  updated_at: string;
}

/** 422 from PATCH when the merged plan is invalid: `detail` is one of these codes. Pydantic
 * validation errors (malformed bodies) come back as FastAPI's standard list in `detail`. */
export type PovPatchRuleError = "invalid_dates" | "invalid_thresholds";

/** 409 body from PATCH /api/py/pov/{id}. */
export interface PovConflict {
  code: "version_conflict" | "plan_frozen";
  message: string;
  current: PovOwnerView;
  changed_by: string | null;
  changed_at: string;
}

// ---- readiness and transitions (GET /{id}/readiness, POST /{id}/transitions)

export type TransitionTarget = "collaborating" | "locked";
export type ReadinessKey = "pain_points" | "stakeholders" | "criteria" | "links" | "dates" | "sponsor_agreed";

/** Codes the server sends today; render unknown codes generically so a new one never breaks the page. */
export type ReadinessProblemCode =
  | "no_pain_points" | "missing_value_range" | "missing_solve_bucket"
  | "no_sponsor" | "multiple_sponsors" | "no_champion_or_evaluator"
  | "too_few_criteria" | "weight_below_minimum" | "not_measurable" | "missing_scorer" | "scorer_not_on_plan"
  | "missing_evidence_source" | "weights_not_100"
  | "no_links" | "criterion_not_linked" | "pain_point_not_linked"
  | "missing_kickoff" | "missing_checkpoint" | "missing_decision"
  | "invalid_milestone_order" | "invalid_exercise_length"
  | "sponsor_not_agreed" | "plan_changed_since_agreement";

/** Why a check fails. item_kind/item_id name the row to fix; both null when the problem is the set. */
export interface ReadinessProblem {
  code: ReadinessProblemCode | (string & {});
  item_kind: "pain_point" | "stakeholder" | "criterion" | "milestone" | null;
  item_id: string | null;
}

export interface ReadinessCheck {
  key: ReadinessKey;
  ok: boolean;
  problems: ReadinessProblem[];
}

/** The six lock checks for the plan as it stands at `seq`, and what the caller may do next. */
export interface Readiness {
  pov_id: string;
  status: PovStatus;
  seq: number;
  ready: boolean;
  passed: number;
  total: number;
  checks: ReadinessCheck[];
  /** Empty unless the caller owns the plan. "locked" appears only when every check passes. */
  allowed_transitions: TransitionTarget[];
}

/** Asking for the status the plan already has succeeds, so a retry is safe. */
export interface TransitionIn {
  to: TransitionTarget;
  /** UUID. */
  op_id: string;
  /** Only with to: "locked". Omitted: keep what the plan has, else 80 and 60. Go must be above No-go. */
  go_threshold?: number | null;
  no_go_threshold?: number | null;
}

/** 409 from POST transitions. On "version_conflict" re-read readiness and try again. */
export interface TransitionConflict {
  code: "invalid_transition" | "version_conflict";
  message: string;
  current: PovOwnerView;
}

/** 422 from POST transitions when a lock check fails. Other 422s: `detail` is "invalid_thresholds",
 * or FastAPI's standard list for a malformed body. 403: `detail` is "not_owner". */
export interface NotReady {
  detail: "not_ready";
  readiness: Readiness;
}
