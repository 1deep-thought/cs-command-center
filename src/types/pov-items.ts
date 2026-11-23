// Mirrors api/_lib/pov_items.py. Change both together.

export type SolveBucket = "lt_30d" | "m1_3" | "m3_6" | "m6_12" | "gt_12m";
export type ValueSource = "prospect_stated" | "verified";
export type StakeholderRole = "sponsor" | "champion" | "evaluator" | "data_it_owner" | "economic_buyer";
export type EvidenceSource = "prospect_data" | "telemetry" | "test_result" | "attestation";

interface ItemBase {
  pov_id: string;
  position: number | null;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

/** Money is in minor units (cents). */
export interface PainPoint extends ItemBase {
  pain_point_id: string;
  title: string;
  description: string | null;
  raised_by: string | null;
  value_low_minor: number | null;
  value_high_minor: number | null;
  value_basis: string | null;
  value_source: ValueSource | null;
  verified_by: string | null;
  verified_at: string | null;
  solve_bucket: SolveBucket | null;
}
export interface PainPointCreate {
  op_id?: string;
  title: string;
  description?: string | null;
  raised_by?: string | null;
  value_low_minor?: number | null; // send both bounds or neither; high >= low
  value_high_minor?: number | null;
  value_basis?: string | null;
  solve_bucket?: SolveBucket | null;
}
export interface PainPointPatch {
  base_version: number;
  op_id: string;
  title?: string;
  description?: string | null;
  raised_by?: string | null;
  value_low_minor?: number | null;
  value_high_minor?: number | null;
  value_basis?: string | null;
  solve_bucket?: SolveBucket | null;
  value_source?: ValueSource;
}

export interface Stakeholder extends ItemBase {
  stakeholder_id: string;
  name: string;
  email: string | null;
  job_title: string | null;
  roles: StakeholderRole[]; // max 2, unique, never sponsor + evaluator
  is_active: boolean;
}
export interface StakeholderCreate {
  op_id?: string;
  name: string;
  email?: string | null;
  job_title?: string | null;
  roles?: StakeholderRole[];
}
export interface StakeholderPatch {
  base_version: number;
  op_id: string;
  name?: string;
  email?: string | null;
  job_title?: string | null;
  roles?: StakeholderRole[];
  is_active?: boolean;
}

export interface Criterion extends ItemBase {
  criterion_id: string;
  statement: string;
  target_value: number | null;
  unit: string | null;
  is_yes_no: boolean;
  weight_pct: number;
  scorer_id: string | null;
  evidence_source: EvidenceSource | null;
}
export interface CriterionCreate {
  op_id?: string;
  statement: string;
  target_value?: number | null;
  unit?: string | null;
  is_yes_no?: boolean;
  weight_pct?: number;
  scorer_id?: string | null;
  evidence_source?: EvidenceSource | null;
}
export interface CriterionPatch {
  base_version: number;
  op_id: string;
  statement?: string;
  target_value?: number | null;
  unit?: string | null;
  is_yes_no?: boolean;
  weight_pct?: number;
  scorer_id?: string | null;
  evidence_source?: EvidenceSource | null;
}

/** 409 body for item writes. `current` is null when there is no stored item to show (limit_reached, or plan_frozen on a create). */
export interface ItemConflict<T = unknown> {
  code: "version_conflict" | "plan_frozen" | "limit_reached" | "duplicate_kind";
  message: string;
  current: T | null;
}

export const ITEM_LIMITS = { pain_points: 5, stakeholders: 25, criteria: 6, milestones: 4 } as const;

export type MilestoneKind = "kickoff" | "checkpoint" | "readout" | "decision";
export const MILESTONE_KINDS: readonly MilestoneKind[] = ["kickoff", "checkpoint", "readout", "decision"];

/** No actor columns: created_by / updated_by are always null. One milestone per kind. */
export interface Milestone extends ItemBase {
  milestone_id: string;
  kind: MilestoneKind;
  due_date: string | null; // YYYY-MM-DD
  completed_at: string | null;
}
export interface MilestoneCreate {
  op_id?: string;
  kind: MilestoneKind;
  due_date: string;
}
export interface MilestonePatch {
  base_version: number;
  op_id: string;
  due_date?: string;
  completed?: boolean; // true stamps completed_at, false clears it
}
/** 422 codes: dates out of order, or kickoff to decision outside 14-60 days. */
export type MilestoneInvalid = "invalid_milestone_order" | "invalid_exercise_length";

/** A criterion proves a pain point. Links are a set: add/remove twice is fine. */
export interface CriterionLink {
  criterion_id: string;
  pain_point_id: string;
}
export interface CriterionLinkIn {
  op_id: string;
  pain_point_id: string;
}


/** GET /api/py/pov/{id}/plan: everything the plan page shows. */
export interface PlanView {
  pov: import("./pov").PovOwnerView;
  pain_points: PainPoint[];
  stakeholders: Stakeholder[];
  criteria: Criterion[];
  milestones: Milestone[];
  links: CriterionLink[];
  readiness: import("./pov").Readiness;
}
