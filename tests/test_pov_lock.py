"""Readiness (the six lock checks), status moves and the transition SQL, against an in-memory repo."""

import json
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from api._lib.pov_items import PlanView
from api._lib.pov_lock_service import get_plan, get_readiness, record_sponsor_agreement, transition
from api._lib.pov_lock_sql import build_agreement_script, build_transition_script
from api._lib.pov_models import TransitionIn
from api._lib.pov_rules import READINESS_KEYS, allowed_transitions, readiness, suggested_decision, weighted_score
from tests.test_pov_items import pov

D = date.fromisoformat
OWNER = "o@x"


def ready_parts():
    """The smallest plan that passes every check except the Sponsor's agreement."""
    return {
        "pain_points": [
            {"pain_point_id": "pp1", "value_low_minor": 100, "value_high_minor": 200, "solve_bucket": "m1_3"},
        ],
        "stakeholders": [
            {"stakeholder_id": "s1", "roles": ["sponsor"], "is_active": True},
            {"stakeholder_id": "s2", "roles": ["champion"], "is_active": True},
        ],
        "criteria": [
            {"criterion_id": "c1", "is_yes_no": True, "target_value": None, "unit": None, "weight_pct": 60,
             "scorer_id": "s2", "evidence_source": "test_result"},
            {"criterion_id": "c2", "is_yes_no": False, "target_value": Decimal("3"), "unit": "s", "weight_pct": 40,
             "scorer_id": "s2", "evidence_source": "telemetry"},
        ],
        "links": [{"criterion_id": "c1", "pain_point_id": "pp1"}, {"criterion_id": "c2", "pain_point_id": "pp1"}],
        "milestones": [
            {"milestone_id": "m1", "kind": "kickoff", "due_date": D("2027-01-04")},
            {"milestone_id": "m2", "kind": "checkpoint", "due_date": D("2027-01-19")},
            {"milestone_id": "m3", "kind": "decision", "due_date": D("2027-02-03")},
        ],
    }


def check(parts, *, seq=5, agreed=5):
    return {c["key"]: c for c in readiness(seq=seq, sponsor_agreed_seq=agreed, **parts)}


def codes(result, key):
    return [(p["code"], p["item_id"]) for p in result[key]["problems"]]


# ------------------------------------------------------------------ rules


def test_a_complete_agreed_plan_passes_all_six_checks_in_order():
    result = readiness(seq=5, sponsor_agreed_seq=5, **ready_parts())
    assert tuple(c["key"] for c in result) == READINESS_KEYS and len(result) == 6
    assert all(c["ok"] and c["problems"] == [] for c in result)


def test_an_empty_plan_fails_every_check():
    empty = {k: [] for k in ("pain_points", "stakeholders", "criteria", "links", "milestones")}
    result = check(empty, agreed=None)
    assert not any(c["ok"] for c in result.values())
    assert codes(result, "pain_points") == [("no_pain_points", None)]
    assert codes(result, "stakeholders") == [("no_sponsor", None), ("no_champion_or_evaluator", None)]
    assert codes(result, "criteria") == [("too_few_criteria", None)]
    assert codes(result, "links") == [("no_links", None)]
    assert codes(result, "dates") == [("missing_kickoff", None), ("missing_checkpoint", None), ("missing_decision", None)]
    assert codes(result, "sponsor_agreed") == [("sponsor_not_agreed", None)]


def test_pain_points_need_a_value_range_and_a_bucket_and_name_the_row():
    parts = ready_parts()
    parts["pain_points"][0].update(value_high_minor=None, solve_bucket=None)
    assert codes(check(parts), "pain_points") == [("missing_value_range", "pp1"), ("missing_solve_bucket", "pp1")]


def test_exactly_one_active_sponsor_and_a_champion_or_evaluator():
    parts = ready_parts()
    parts["stakeholders"].append({"stakeholder_id": "s3", "roles": ["sponsor", "champion"], "is_active": True})
    assert codes(check(parts), "stakeholders") == [("multiple_sponsors", "s1"), ("multiple_sponsors", "s3")]
    parts["stakeholders"][2]["is_active"] = False  # people who left do not count
    assert check(parts)["stakeholders"]["ok"]
    parts["stakeholders"][1]["roles"] = ["evaluator"]
    assert check(parts)["stakeholders"]["ok"]
    parts["stakeholders"][1]["roles"] = ["economic_buyer"]
    assert codes(check(parts), "stakeholders") == [("no_champion_or_evaluator", None)]


def test_criteria_must_be_scorable_and_total_exactly_100():
    parts = ready_parts()
    parts["criteria"][0]["weight_pct"] = 55
    assert codes(check(parts), "criteria") == [("weights_not_100", None)]
    parts["criteria"][0].update(weight_pct=95)
    parts["criteria"][1].update(weight_pct=5, unit=None, scorer_id=None, evidence_source=None)
    assert codes(check(parts), "criteria") == [
        ("weight_below_minimum", "c2"), ("not_measurable", "c2"), ("missing_scorer", "c2"), ("missing_evidence_source", "c2"),
    ]
    parts = ready_parts()
    parts["stakeholders"][1]["is_active"] = False  # the scorer left the deal
    parts["stakeholders"].append({"stakeholder_id": "s9", "roles": ["evaluator"], "is_active": True})
    assert codes(check(parts), "criteria") == [("scorer_not_on_plan", "c1"), ("scorer_not_on_plan", "c2")]
    parts = ready_parts()
    del parts["criteria"][1]
    parts["criteria"][0]["weight_pct"] = 100
    assert codes(check(parts), "criteria") == [("too_few_criteria", None)]


def test_links_are_needed_both_ways_and_ignore_deleted_ends():
    parts = ready_parts()
    parts["pain_points"].append({"pain_point_id": "pp2", "value_low_minor": 1, "value_high_minor": 2, "solve_bucket": "lt_30d"})
    parts["links"] = [{"criterion_id": "c1", "pain_point_id": "pp1"}, {"criterion_id": "c2", "pain_point_id": "gone"}]
    assert codes(check(parts), "links") == [("criterion_not_linked", "c2"), ("pain_point_not_linked", "pp2")]


def test_dates_need_kickoff_checkpoint_and_decision_but_not_readout():
    parts = ready_parts()
    assert check(parts)["dates"]["ok"]  # no readout
    del parts["milestones"][1]
    assert codes(check(parts), "dates") == [("missing_checkpoint", None)]
    parts["milestones"][1]["due_date"] = D("2027-06-01")
    assert ("invalid_exercise_length", None) in codes(check(parts), "dates")


def test_any_edit_after_the_sponsor_agreed_voids_the_agreement():
    assert codes(check(ready_parts(), seq=6, agreed=5), "sponsor_agreed") == [("plan_changed_since_agreement", None)]


def test_only_the_owner_moves_a_plan_and_locking_needs_readiness():
    assert allowed_transitions("draft", is_owner=True, ready=False) == ["collaborating"]
    assert allowed_transitions("draft", is_owner=False, ready=True) == []
    assert allowed_transitions("collaborating", is_owner=True, ready=False) == []
    assert allowed_transitions("collaborating", is_owner=True, ready=True) == ["locked"]
    assert allowed_transitions("locked", is_owner=True, ready=True) == ["decided"]
    assert allowed_transitions("locked", is_owner=False, ready=True) == []
    assert allowed_transitions("decided", is_owner=True, ready=True) == []


# ------------------------------------------------------------------ service


class FakeLock:
    def __init__(self, status="collaborating", parts=None, agreed=True):
        self.pov = pov(status).model_copy(update={"seq": 5})
        self.parts = {**(parts or ready_parts()), "sponsor_agreed_seq": 5 if agreed else None}
        self.writes: list[dict] = []
        self.edit_before_write = False  # someone edits the plan between the checks and the write

    def get_pov(self, pov_id):
        return self.pov if pov_id == "p1" else None

    def team(self, pov_id):
        return {"owner_email": self.pov.owner_email, "members": list(self.parts.get("members") or [])} if pov_id == "p1" else None

    def plan_parts(self, pov_id):
        return self.parts

    def write_transition(self, target, *, pov_id, from_status, actor, op_id, old, new, expected_seq=None, **locking):
        if self.edit_before_write:
            self.pov = self.pov.model_copy(update={"seq": self.pov.seq + 1})
        if self.pov.status != from_status or (expected_seq is not None and expected_seq != self.pov.seq):
            return 2
        self.writes.append({"target": target, "old": old, "new": new, "expected_seq": expected_seq, **locking})
        update = {"status": target, "seq": self.pov.seq + 1, "version": self.pov.version + 1}
        if target == "decided":
            update.update(decision=locking["decision"])
        if target == "locked":
            update.update(
                go_threshold=locking["go_threshold"], no_go_threshold=locking["no_go_threshold"],
                baseline_end_date=locking["baseline_end_date"],
            )
        self.pov = self.pov.model_copy(update=update)
        return 1


    def write_agreement(self, *, pov_id, actor, op_id, detail, expected_seq):
        if self.edit_before_write:
            self.pov = self.pov.model_copy(update={"seq": self.pov.seq + 1})
        if self.pov.status != "collaborating" or expected_seq != self.pov.seq:
            return 2
        self.writes.append({"agreement": detail})
        self.pov = self.pov.model_copy(update={"seq": self.pov.seq + 1})
        self.parts["sponsor_agreed_seq"] = self.pov.seq
        return 1


def agree(repo, actor=OWNER):
    return record_sponsor_agreement(repo, "p1", uuid4(), actor)


def move(repo, to, actor=OWNER, **fields):
    return transition(repo, "p1", TransitionIn(to=to, op_id=uuid4(), **fields), actor)


def test_readiness_reports_progress_and_what_the_caller_may_do():
    repo = FakeLock(agreed=False)
    state = get_readiness(repo, "p1", OWNER)
    assert (state.ready, state.passed, state.total, state.allowed_transitions) == (False, 5, 6, [])
    assert [c.key for c in state.checks if not c.ok] == ["sponsor_agreed"]
    repo = FakeLock()
    assert get_readiness(repo, "p1", OWNER).allowed_transitions == ["locked"]
    assert get_readiness(repo, "p1", OWNER).is_owner
    other = get_readiness(repo, "p1", "someone@x")
    assert (other.is_owner, other.allowed_transitions) == (False, [])
    assert get_readiness(repo, "nope", OWNER) is None


def test_start_collaborating_then_asking_again_is_a_success_without_a_write():
    repo = FakeLock(status="draft")
    assert move(repo, "collaborating").pov.status == "collaborating"
    assert move(repo, "collaborating").kind == "applied" and len(repo.writes) == 1


def test_only_the_owner_may_move_the_plan():
    repo = FakeLock()
    assert move(repo, "locked", actor="colleague@x").kind == "forbidden" and not repo.writes
    assert move(repo, "locked", actor=" O@X ").kind == "applied"  # same person, different typing


def test_a_draft_cannot_lock_and_a_locked_plan_cannot_go_back():
    assert move(FakeLock(status="draft"), "locked").kind == "invalid_transition"
    assert move(FakeLock(status="locked"), "collaborating").kind == "invalid_transition"
    assert move(FakeLock(), "locked", actor=OWNER).kind == "applied"
    assert transition(FakeLock(), "nope", TransitionIn(to="locked", op_id=uuid4()), OWNER).kind == "not_found"


def test_lock_is_refused_with_the_failing_checks_and_writes_nothing():
    repo = FakeLock(agreed=False)
    result = move(repo, "locked")
    assert result.kind == "not_ready" and not repo.writes and repo.pov.status == "collaborating"
    assert [c.key for c in result.readiness.checks if not c.ok] == ["sponsor_agreed"]


def test_lock_freezes_thresholds_baseline_date_and_a_snapshot_of_the_plan():
    repo = FakeLock()
    locked = move(repo, "locked").pov
    assert (locked.status, locked.go_threshold, locked.no_go_threshold) == ("locked", 80, 60)  # the defaults
    assert locked.baseline_end_date == D("2027-02-03") and locked.seq == 6
    write = repo.writes[0]
    assert write["expected_seq"] == 5
    snapshot = json.loads(write["snapshot_json"])
    assert (snapshot["pov"]["status"], snapshot["pov"]["seq"]) == ("locked", 6)
    assert snapshot["pov"]["go_threshold"] == 80 and snapshot["pov"]["baseline_end_date"] == "2027-02-03"
    assert snapshot["criteria"][1]["target_value"] == "3" and len(snapshot["links"]) == 2
    assert snapshot["milestones"][0]["due_date"] == "2027-01-04" and snapshot["sponsor_agreed_seq"] == 5


def test_lock_thresholds_come_from_the_request_then_the_plan_and_go_must_beat_no_go():
    repo = FakeLock()
    repo.pov = repo.pov.model_copy(update={"go_threshold": 75, "no_go_threshold": 50})
    locked = move(repo, "locked", go_threshold=90).pov
    assert (locked.go_threshold, locked.no_go_threshold) == (90, 50)
    repo = FakeLock()
    result = move(repo, "locked", go_threshold=50)  # not above the default No-go of 60
    assert (result.kind, result.code) == ("invalid", "invalid_thresholds") and not repo.writes


def test_an_edit_between_the_checks_and_the_write_stops_the_lock():
    repo = FakeLock()
    repo.edit_before_write = True
    result = move(repo, "locked")
    assert result.kind == "conflict" and result.pov.status == "collaborating" and not repo.writes


def test_thresholds_are_only_accepted_when_locking():
    with pytest.raises(ValidationError):
        TransitionIn(to="collaborating", op_id=uuid4(), go_threshold=80)
    with pytest.raises(ValidationError):
        TransitionIn(to="decided", op_id=uuid4())


# ------------------------------------------------------------------ SQL


def script(target, **kw):
    return build_transition_script(
        target, pov_table="p.d.pov", revision_table="p.d.rev", log_table="p.d.log", pov_id="p1",
        from_status="draft" if target == "collaborating" else "collaborating", actor="a", op_id="o",
        old_json="{}", new_json="{}", **kw,
    )


def test_collaborating_sql_is_gated_on_status_only_and_takes_no_snapshot():
    sql, params = script("collaborating")
    assert "status = @from_status" in sql and "@expected_seq" not in sql and "p.d.rev" not in sql
    assert "go_threshold" not in sql and {p.name for p in params} >= {"target", "from_status", "op_id"}


def test_lock_sql_is_gated_on_seq_and_snapshots_then_logs_in_the_same_transaction():
    sql, params = script(
        "locked", expected_seq=5, go_threshold=80, no_go_threshold=60, baseline_end_date=D("2027-02-03"), snapshot_json="{}",
    )
    assert "AND seq = @expected_seq" in sql and "go_threshold = @go_threshold" in sql
    assert "baseline_end_date = @baseline_end_date" in sql and "PARSE_JSON(@snapshot)" in sql
    assert sql.index("BEGIN TRANSACTION") < sql.index("p.d.rev") < sql.index("INSERT INTO `p.d.log`") < sql.index("COMMIT")
    assert "ROLLBACK TRANSACTION" in sql and "SET result = 2" in sql
    assert next(p for p in params if p.name == "expected_seq").value == 5


def test_lock_sql_refuses_to_build_without_everything_it_freezes():
    with pytest.raises(ValueError):
        script("locked", expected_seq=5, go_threshold=80, no_go_threshold=60)


# ------------------------------------------------------------------ owner-recorded Sponsor agreement


def test_owner_records_the_agreement_then_the_plan_can_lock():
    repo = FakeLock(agreed=False)
    result = agree(repo)
    assert result.kind == "applied" and result.readiness.ready and result.readiness.allowed_transitions == ["locked"]
    detail = repo.writes[0]["agreement"]
    assert detail == {"method": "recorded_by_owner", "recorded_by": OWNER, "sponsor_stakeholder_id": "s1", "sponsor_name": None}
    assert agree(repo).kind == "applied" and len(repo.writes) == 1  # unchanged plan: nothing new to record
    assert move(repo, "locked").pov.status == "locked"


def test_an_edit_after_the_recorded_agreement_needs_a_new_one():
    repo = FakeLock(agreed=False)
    agree(repo)
    repo.pov = repo.pov.model_copy(update={"seq": repo.pov.seq + 1})  # someone edits the plan
    assert move(repo, "locked").kind == "not_ready"
    assert agree(repo).readiness.ready and len(repo.writes) == 2


def test_agreement_needs_the_owner_a_collaborating_plan_and_the_other_five_checks():
    assert agree(FakeLock(agreed=False), actor="colleague@x").kind == "forbidden"
    assert agree(FakeLock(status="draft", agreed=False)).kind == "invalid_transition"
    assert agree(FakeLock(status="locked")).kind == "invalid_transition"
    parts = ready_parts()
    parts["criteria"][0]["weight_pct"] = 50
    repo = FakeLock(parts=parts, agreed=False)
    result = agree(repo)
    assert result.kind == "not_ready" and not repo.writes
    assert [c.key for c in result.readiness.checks if not c.ok] == ["criteria", "sponsor_agreed"]
    assert record_sponsor_agreement(FakeLock(), "nope", uuid4(), OWNER).kind == "not_found"


def test_an_edit_while_recording_the_agreement_is_a_conflict():
    repo = FakeLock(agreed=False)
    repo.edit_before_write = True
    assert agree(repo).kind == "conflict" and not repo.writes


def test_agreement_sql_is_gated_on_status_and_seq_and_logs_at_the_new_seq():
    sql, params = build_agreement_script(
        pov_table="p.d.pov", log_table="p.d.log", pov_id="p1", actor="a", op_id="o", field="sponsor_agreed",
        new_json="{}", expected_seq=5,
    )
    assert "status = 'collaborating'" in sql and "AND seq = @expected_seq" in sql
    assert "'pov', pov_id, @field, NULL, @new_json" in sql and "version" not in sql
    assert sql.index("UPDATE `p.d.pov`") < sql.index("INSERT INTO `p.d.log`") < sql.index("COMMIT")
    assert next(p for p in params if p.name == "field").value == "sponsor_agreed"


# ------------------------------------------------------------------ whole plan


def test_get_plan_returns_every_part_and_readiness():
    plan = get_plan(FakeLock(agreed=False), "p1", OWNER)
    assert set(plan) == {"pov", "pain_points", "stakeholders", "criteria", "links", "milestones", "readiness", "investment", "team"}
    assert plan["readiness"].passed == 5 and len(plan["criteria"]) == 2
    assert get_plan(FakeLock(), "nope", OWNER) is None


def test_plan_view_accepts_rows_shaped_like_the_tables():
    from api._lib.pov_item_specs import CRITERION, MILESTONE, PAIN_POINT, STAKEHOLDER
    from tests.test_pov_items import NOW

    def row(spec, **values):  # every view column present, unset ones NULL, as BigQuery returns them
        base = dict.fromkeys(spec.view_columns)
        base.update(pov_id="p1", version=1, created_at=NOW, updated_at=NOW, **values)
        return base

    repo = FakeLock()
    view = PlanView(
        pov=repo.pov,
        pain_points=[row(PAIN_POINT, pain_point_id="pp1", title="t")],
        stakeholders=[row(STAKEHOLDER, stakeholder_id="s1", name="n", roles=["sponsor"], is_active=True)],
        criteria=[row(CRITERION, criterion_id="c1", statement="s", is_yes_no=True, weight_pct=100, target_value=Decimal("2.5"))],
        milestones=[row(MILESTONE, milestone_id="m1", kind="kickoff", due_date=D("2027-01-04"))],
        links=[{"criterion_id": "c1", "pain_point_id": "pp1"}],
        readiness=get_readiness(repo, "p1", OWNER),
    )
    dumped = view.model_dump(mode="json")
    assert dumped["criteria"][0]["target_value"] == 2.5 and dumped["milestones"][0]["due_date"] == "2027-01-04"


# ------------------------------------------------------------------ results and the decision


def scored_parts(*scores):
    parts = ready_parts()
    for criterion, score in zip(parts["criteria"], scores):
        criterion["score"] = score
    return parts


def test_weighted_score_needs_every_criterion_scored():
    assert weighted_score(ready_parts()["criteria"]) is None
    assert weighted_score(scored_parts(100, None)["criteria"]) is None
    assert weighted_score(scored_parts(100, Decimal("50"))["criteria"]) == 80.0  # 60 x 1.0 + 40 x 0.5
    assert weighted_score(scored_parts(0, 0)["criteria"]) == 0.0
    assert weighted_score([]) is None
    # Half-way cases round up, the same as planScore on the page (25 x 85 + 75 x 100 = 96.25).
    parts = scored_parts(85, 100)
    parts["criteria"][0]["weight_pct"], parts["criteria"][1]["weight_pct"] = 25, 75
    assert weighted_score(parts["criteria"]) == 96.3


def test_thresholds_suggest_go_extend_or_no_go():
    assert suggested_decision(80, 80, 60) == "go"
    assert suggested_decision(79.9, 80, 60) == "extend"
    assert suggested_decision(60, 80, 60) == "extend"
    assert suggested_decision(59.9, 80, 60) == "no_go"


def test_deciding_needs_a_result_for_every_criterion():
    repo = FakeLock("locked", parts=scored_parts(100, None))
    r = move(repo, "decided", decision="go")
    assert (r.kind, r.code) == ("invalid", "results_missing") and repo.writes == []


def test_owner_records_the_decision_with_the_score_in_the_log():
    repo = FakeLock("locked", parts=scored_parts(100, 50))
    repo.pov = repo.pov.model_copy(update={"go_threshold": 80, "no_go_threshold": 60})
    r = move(repo, "decided", decision="extend", note="Sponsor wants two more weeks")
    assert r.kind == "applied" and (r.pov.status, r.pov.decision) == ("decided", "extend")
    write = repo.writes[-1]
    assert write["expected_seq"] == 5 and write["decision"] == "extend"
    assert write["new"] == {
        "status": "decided", "decision": "extend", "score": 80.0, "suggested": "go",
        "note": "Sponsor wants two more weeks",
    }
    # Asking again for the same decision is a success and writes nothing (a second click, or a retry)...
    assert move(repo, "decided", decision="extend").kind == "applied" and len(repo.writes) == 1
    # ...but a different one is refused, never reported as saved.
    again = move(repo, "decided", decision="go")
    assert again.kind == "invalid_transition" and again.pov.decision == "extend" and len(repo.writes) == 1


def test_deciding_is_for_the_owner_of_a_locked_plan_only():
    assert move(FakeLock("locked", parts=scored_parts(100, 100)), "decided", actor="x@x", decision="go").kind == "forbidden"
    assert move(FakeLock("collaborating", parts=scored_parts(100, 100)), "decided", decision="go").kind == "invalid_transition"


def test_a_result_changed_while_deciding_is_a_conflict():
    repo = FakeLock("locked", parts=scored_parts(100, 100))
    repo.edit_before_write = True
    assert move(repo, "decided", decision="go").kind == "conflict"


def test_decision_fields_belong_to_deciding_only():
    with pytest.raises(ValidationError):
        TransitionIn(to="decided", op_id=uuid4())
    with pytest.raises(ValidationError):
        TransitionIn(to="decided", op_id=uuid4(), decision="maybe")
    with pytest.raises(ValidationError):
        TransitionIn(to="locked", op_id=uuid4(), decision="go")
    with pytest.raises(ValidationError):
        TransitionIn(to="collaborating", op_id=uuid4(), note="x")


def test_decide_sql_sets_the_decision_and_is_gated_on_the_seq_it_read():
    common = dict(pov_table="p.d.pov", revision_table="p.d.rev", log_table="p.d.log", pov_id="p1",
                  from_status="locked", actor="a", op_id="o", old_json="{}", new_json="{}")
    sql, params = build_transition_script("decided", expected_seq=7, decision="no_go", **common)
    assert "decision = @decision" in sql and "AND seq = @expected_seq" in sql and "p.d.rev" not in sql
    assert {p.name: p.value for p in params}["decision"] == "no_go"
    with pytest.raises(ValueError):
        build_transition_script("decided", expected_seq=7, decision="go; DROP", **common)
    with pytest.raises(ValueError):
        build_transition_script("decided", decision="go", **common)
