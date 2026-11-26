import type { PovDecision, PovStatus, ReadinessKey } from "@/types/pov";
import type { EvidenceSource, MilestoneKind, SolveBucket, StakeholderRole } from "@/types/pov-items";

export const STATUS_LABEL: Record<PovStatus, string> = {
  draft: "Draft",
  collaborating: "Collaborating",
  locked: "Locked",
  decided: "Decided",
};

// Neutral on purpose: status is progress, not health. Color is kept for the decision.
export const STATUS_BADGE: Record<PovStatus, string> = {
  draft: "border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-600 dark:text-zinc-400",
  collaborating: "border-zinc-300 text-zinc-800 dark:border-zinc-600 dark:text-zinc-200",
  locked: "border-zinc-400 bg-zinc-100 text-zinc-900 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100",
  decided: "border-zinc-300 text-zinc-800 dark:border-zinc-600 dark:text-zinc-200",
};

export const DECISION_LABEL: Record<PovDecision, string> = { go: "Go", extend: "Extend", no_go: "No-go" };
// A decided plan shows its decision as the badge: this is the one place status carries color.
export const DECISION_BADGE: Record<PovDecision, string> = {
  go: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  extend: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  no_go: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
};
export const DECISION_TEXT: Record<PovDecision, string> = {
  go: "text-emerald-700 dark:text-emerald-400",
  extend: "text-amber-700 dark:text-amber-400",
  no_go: "text-rose-700 dark:text-rose-400",
};

export const CHECK_LABEL: Record<ReadinessKey, string> = {
  pain_points: "Pain points valued",
  stakeholders: "Right people on the plan",
  criteria: "Success criteria measurable",
  links: "Pain points tied to criteria",
  dates: "Timeline set",
  sponsor_agreed: "Sponsor agreed",
};

/** Sentence for a readiness problem. `{name}` is replaced with the row's title when the problem names a row. */
export const PROBLEM_TEXT: Record<string, string> = {
  no_pain_points: "Add at least one pain point.",
  missing_value_range: "{name} has no yearly value.",
  missing_solve_bucket: "{name} has no time to solve.",
  no_sponsor: "Name a Sponsor.",
  multiple_sponsors: "Only one person can be Sponsor: {name} is one of several.",
  no_champion_or_evaluator: "Add a Champion or an Evaluator.",
  too_few_criteria: "Add at least 2 success criteria.",
  weight_below_minimum: "{name} weighs less than 10.",
  not_measurable: "{name} needs a number and unit, or Yes/No.",
  missing_scorer: "{name} has no scorer.",
  scorer_not_on_plan: "The scorer for {name} is no longer on the plan.",
  missing_evidence_source: "{name} doesn't say where the evidence comes from.",
  weights_not_100: "Weights must add up to 100.",
  no_links: "No criterion is tied to a pain point yet.",
  criterion_not_linked: "{name} doesn't solve any pain point.",
  pain_point_not_linked: "{name} has no criterion.",
  missing_kickoff: "Set a kickoff date.",
  missing_checkpoint: "Set a checkpoint date.",
  missing_decision: "Set a decision date.",
  invalid_milestone_order: "Milestone dates are out of order.",
  invalid_exercise_length: "Kickoff to decision must be 14 to 60 days.",
  sponsor_not_agreed: "The Sponsor hasn't agreed to this plan yet.",
  plan_changed_since_agreement: "The plan changed after the Sponsor agreed. Record the agreement again.",
};
export const PROBLEM_FALLBACK = "Something needs fixing here.";

export const SOLVE_LABEL: Record<SolveBucket, string> = {
  lt_30d: "Under 30 days",
  m1_3: "1–3 months",
  m3_6: "3–6 months",
  m6_12: "6–12 months",
  gt_12m: "Over 12 months",
};

export const ROLE_LABEL: Record<StakeholderRole, string> = {
  sponsor: "Sponsor",
  champion: "Champion",
  evaluator: "Evaluator",
  data_it_owner: "Data / IT owner",
  economic_buyer: "Economic buyer",
};

export const EVIDENCE_LABEL: Record<EvidenceSource, string> = {
  prospect_data: "Customer's data",
  telemetry: "Product telemetry",
  test_result: "Test result",
  attestation: "Signed statement",
};

export const MILESTONE_LABEL: Record<MilestoneKind, string> = {
  kickoff: "Kickoff",
  checkpoint: "Mid-point checkpoint",
  readout: "Readout",
  decision: "Decision",
};

export const STATUS_ORDER: readonly PovStatus[] = ["draft", "collaborating", "locked", "decided"];

export const TEAM_ROLE_LABEL = { ae: "Account Executive", se: "Solution Engineer" } as const;
