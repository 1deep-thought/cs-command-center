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
