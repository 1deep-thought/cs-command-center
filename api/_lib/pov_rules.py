"""The one place PoV business rules live (design doc: "Rules in one place").

Pure functions over plain values so they are testable without BigQuery or FastAPI.
"""

from __future__ import annotations

from datetime import date
from typing import Final

from .pov_milestone_rules import invalid_milestone_dates

# Plan fields can be edited only until the plan locks.
EDITABLE_STATUSES: Final = frozenset({"draft", "collaborating"})


def plan_is_editable(status: str) -> bool:
    return status in EDITABLE_STATUSES


def invalid_changes(
    *,
    current_start: date | None,
    current_end: date | None,
    current_go: int | None,
    current_no_go: int | None,
    changes: dict[str, object],
) -> str | None:
    """Check the plan as it would be after the patch. Returns an error code or None."""
    start = changes["start_date"] if "start_date" in changes else current_start
    end = changes["end_date"] if "end_date" in changes else current_end
    go = changes["go_threshold"] if "go_threshold" in changes else current_go
    no_go = changes["no_go_threshold"] if "no_go_threshold" in changes else current_no_go

    if isinstance(start, date) and isinstance(end, date) and end < start:
        return "invalid_dates"
    if isinstance(go, int) and isinstance(no_go, int) and go <= no_go:
        return "invalid_thresholds"  # Go must be strictly above No-go
    return None


def invalid_pain_point_change(current: dict[str, object], changes: dict[str, object]) -> str | None:
    """Value range after the patch: both bounds or neither, and high >= low."""
    low = changes["value_low_minor"] if "value_low_minor" in changes else current.get("value_low_minor")
    high = changes["value_high_minor"] if "value_high_minor" in changes else current.get("value_high_minor")
    if (low is None) != (high is None):
        return "invalid_value_range"
    if isinstance(low, int) and isinstance(high, int) and high < low:
        return "invalid_value_range"
    return None


# ------------------------------------------------------------------ transitions

# The only moves a plan makes forward (design doc: four statuses). Deciding and abandoning come later.
TRANSITIONS: Final = {"collaborating": "draft", "locked": "collaborating"}  # target -> status it comes from
DEFAULT_GO, DEFAULT_NO_GO = 80, 60


def allowed_transitions(status: str, *, is_owner: bool, ready: bool) -> list[str]:
    """What this person may do next. Only the owner moves a plan forward; locking also needs readiness."""
    if not is_owner:
        return []
    if status == "draft":
        return ["collaborating"]
    if status == "collaborating" and ready:
        return ["locked"]
    return []


# ------------------------------------------------------------------ readiness (the six lock checks)

READINESS_KEYS: Final = ("pain_points", "stakeholders", "criteria", "links", "dates", "sponsor_agreed")
MIN_CRITERIA, MIN_WEIGHT, WEIGHT_TOTAL = 2, 10, 100
REQUIRED_MILESTONES: Final = ("kickoff", "checkpoint", "decision")  # the readout date is optional

Problem = dict[str, str | None]


def _problem(code: str, item_kind: str | None = None, item_id: object = None) -> Problem:
    return {"code": code, "item_kind": item_kind, "item_id": None if item_id is None else str(item_id)}


def readiness(
    *,
    seq: int,
    sponsor_agreed_seq: int | None,
    pain_points: list[dict[str, object]],
    stakeholders: list[dict[str, object]],
    criteria: list[dict[str, object]],
    links: list[dict[str, object]],
    milestones: list[dict[str, object]],
) -> list[dict[str, object]]:
    """A plan locks only when it can be scored. One entry per check, in READINESS_KEYS order, each with
    the problems that fail it; a problem names the row to fix when there is one. Live rows only."""
    found: dict[str, list[Problem]] = {key: [] for key in READINESS_KEYS}

    # 1. One to five pain points, each with a value range and a timeline bucket.
    if not pain_points:
        found["pain_points"].append(_problem("no_pain_points"))
    for pp in pain_points:
        if pp.get("value_low_minor") is None or pp.get("value_high_minor") is None:
            found["pain_points"].append(_problem("missing_value_range", "pain_point", pp["pain_point_id"]))
        if pp.get("solve_bucket") is None:
            found["pain_points"].append(_problem("missing_solve_bucket", "pain_point", pp["pain_point_id"]))

    # 2. Exactly one Sponsor and at least one Champion or Evaluator, among people still on the deal.
    active = [s for s in stakeholders if s.get("is_active") is not False]
    active_ids = {str(s["stakeholder_id"]) for s in active}
    sponsors = [s for s in active if "sponsor" in (s.get("roles") or [])]
    if not sponsors:
        found["stakeholders"].append(_problem("no_sponsor"))
    elif len(sponsors) > 1:
        found["stakeholders"] += [_problem("multiple_sponsors", "stakeholder", s["stakeholder_id"]) for s in sponsors]
    if not any({"champion", "evaluator"} & set(s.get("roles") or []) for s in active):
        found["stakeholders"].append(_problem("no_champion_or_evaluator"))

    # 3. Two to six criteria that can be scored, each weighing at least 10, totalling exactly 100.
    if len(criteria) < MIN_CRITERIA:
        found["criteria"].append(_problem("too_few_criteria"))
    for c in criteria:
        cid = c["criterion_id"]
        if (c.get("weight_pct") or 0) < MIN_WEIGHT:
            found["criteria"].append(_problem("weight_below_minimum", "criterion", cid))
        if not c.get("is_yes_no") and (c.get("target_value") is None or c.get("unit") is None):
            found["criteria"].append(_problem("not_measurable", "criterion", cid))
        if c.get("scorer_id") is None:
            found["criteria"].append(_problem("missing_scorer", "criterion", cid))
        elif str(c["scorer_id"]) not in active_ids:  # deleted, left the deal, or never a stakeholder
            found["criteria"].append(_problem("scorer_not_on_plan", "criterion", cid))
        if c.get("evidence_source") is None:
            found["criteria"].append(_problem("missing_evidence_source", "criterion", cid))
    if criteria and sum(int(c.get("weight_pct") or 0) for c in criteria) != WEIGHT_TOTAL:
        found["criteria"].append(_problem("weights_not_100"))  # never rescaled silently

    # 4. Every criterion proves a pain point, and every pain point is proved by a criterion.
    live_pp = {str(pp["pain_point_id"]) for pp in pain_points}
    live_c = {str(c["criterion_id"]) for c in criteria}
    pairs = [(str(l["criterion_id"]), str(l["pain_point_id"])) for l in links]
    pairs = [(c, pp) for c, pp in pairs if c in live_c and pp in live_pp]
    linked_c, linked_pp = {c for c, _ in pairs}, {pp for _, pp in pairs}
    if not criteria or not pain_points:
        found["links"].append(_problem("no_links"))  # nothing to link yet: not a pass
    found["links"] += [_problem("criterion_not_linked", "criterion", c["criterion_id"]) for c in criteria if str(c["criterion_id"]) not in linked_c]
    found["links"] += [_problem("pain_point_not_linked", "pain_point", pp["pain_point_id"]) for pp in pain_points if str(pp["pain_point_id"]) not in linked_pp]

    # 5. Kickoff, mid-point checkpoint and decision dates are set, in order, 14 to 60 days end to end.
    dates = {str(m["kind"]): m.get("due_date") for m in milestones}
    found["dates"] += [_problem(f"missing_{kind}") for kind in REQUIRED_MILESTONES if dates.get(kind) is None]
    if (error := invalid_milestone_dates(dates)) is not None:  # type: ignore[arg-type]
        found["dates"].append(_problem(error))

    # 6. The Sponsor agreed to the plan exactly as it stands (any edit since then voids the agreement).
    if sponsor_agreed_seq is None:
        found["sponsor_agreed"].append(_problem("sponsor_not_agreed"))
    elif sponsor_agreed_seq != seq:
        found["sponsor_agreed"].append(_problem("plan_changed_since_agreement"))

    return [{"key": key, "ok": not found[key], "problems": found[key]} for key in READINESS_KEYS]
