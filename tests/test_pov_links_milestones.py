"""Milestones (rules, spec, SQL, service) and criterion<->pain point links."""

from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from api._lib.pov_item_service import create_item, patch_item
from api._lib.pov_item_specs import CRITERION, MILESTONE, PAIN_POINT
from api._lib.pov_item_sql import build_write_script
from api._lib.pov_items import MilestoneCreate, MilestonePatch
from api._lib.pov_link_service import change_link, list_links
from api._lib.pov_link_sql import build_link_script
from api._lib.pov_milestone_rules import invalid_milestone_dates, suggested_dates
from tests.test_pov_items import FakeItems, pov

D = date.fromisoformat


# ------------------------------------------------------------------ rules


def test_suggested_dates_follow_kickoff():
    s = suggested_dates(D("2026-12-01"))
    assert s["checkpoint"] == D("2026-12-16") and s["decision"] == D("2026-12-31")


def test_milestone_order_and_length_rules():
    ok = {"kickoff": D("2026-12-01"), "checkpoint": D("2026-12-15"), "readout": D("2026-12-28"), "decision": D("2026-12-31")}
    assert invalid_milestone_dates(ok) is None
    assert invalid_milestone_dates({**ok, "checkpoint": D("2026-11-20")}) == "invalid_milestone_order"
    short = {"kickoff": D("2026-12-01"), "decision": D("2026-12-10")}
    assert invalid_milestone_dates(short) == "invalid_exercise_length"
    assert invalid_milestone_dates({**short, "decision": D("2027-03-15")}) == "invalid_exercise_length"
    assert invalid_milestone_dates({"kickoff": D("2026-12-01")}) is None  # partial plans are fine


# ------------------------------------------------------------------ models / SQL


def test_milestone_models():
    assert MilestoneCreate(kind="kickoff", due_date="2026-12-01")
    with pytest.raises(ValidationError):
        MilestoneCreate(kind="launch", due_date="2026-12-01")
    with pytest.raises(ValidationError):
        MilestonePatch(base_version=1, op_id=uuid4())
    assert MilestonePatch(base_version=1, op_id=uuid4(), completed=True)


def build(spec, mode, values, **kw):
    return build_write_script(
        spec, mode, pov_table="p.d.pov", item_table="p.d.item", log_table="p.d.log", pov_id="p1",
        item_id="i1", actor="a", op_id="o", values=values, old_json="{}", new_json="{}", **kw,
    )


def test_milestone_sql_has_no_actor_columns_and_checks_uniqueness():
    sql, _ = build(MILESTONE, "create", {"kind": "kickoff", "due_date": "2026-12-01"})
    assert "created_by" not in sql and "updated_by" not in sql.split("p.d.item", 1)[1]
    assert "NOT EXISTS" in sql and "IF(EXISTS" in sql and ", 5" in sql


def test_delete_cascades_to_links():
    for spec in (PAIN_POINT, CRITERION):
        sql, _ = build(spec, "delete", {}, base_version=1, cascade_tables={"criterion_pain_point": "p.d.link"})
        assert "UPDATE `p.d.link` SET deleted_at" in sql
        assert sql.index("UPDATE `p.d.link`") < sql.rindex("INSERT INTO `p.d.log`")  # item log row comes last
    with pytest.raises(ValueError):
        build(PAIN_POINT, "delete", {}, base_version=1)


def test_link_sql_is_gated_logged_and_atomic():
    for mode in ("add", "remove"):
        sql, params = build_link_script(
            mode, pov_table="p.d.pov", link_table="p.d.link", criterion_table="p.d.c", pain_point_table="p.d.pp",
            log_table="p.d.log", pov_id="p1", criterion_id="c1", pain_point_id="pp1", actor="a", op_id="o",
        )
        assert "status IN ('draft', 'collaborating')" in sql
        assert sql.index("BEGIN TRANSACTION") < sql.index("p.d.log") < sql.index("COMMIT TRANSACTION")
        assert {p.name for p in params} >= {"pov_id", "criterion_id", "pain_point_id", "op_id"}
    add_sql, _ = build_link_script(
        "add", pov_table="p.d.pov", link_table="p.d.link", criterion_table="p.d.c", pain_point_table="p.d.pp",
        log_table="p.d.log", pov_id="p1", criterion_id="c1", pain_point_id="pp1", actor="a", op_id="o",
    )
    assert "p.d.c`" in add_sql and "p.d.pp`" in add_sql  # both ends must be live in this PoV


# ------------------------------------------------------------------ milestone service


class MilestoneFake(FakeItems):
    def write_item(self, spec, mode, **kw):
        code = super().write_item(spec, mode, **kw)
        return code


def make(kind, due, repo):
    return create_item(repo, MILESTONE, "p1", MilestoneCreate(kind=kind, due_date=due), "a@x")


def test_create_validates_dates_against_existing_milestones():
    repo = FakeItems()
    assert make("kickoff", "2026-12-01", repo).kind == "applied"
    bad = make("checkpoint", "2026-11-01", repo)  # before kickoff
    assert bad.kind == "invalid" and bad.code == "invalid_milestone_order"
    assert make("checkpoint", "2026-12-15", repo).kind == "applied"


def test_completed_flag_sets_and_clears_completed_at():
    repo = FakeItems()
    item = make("kickoff", "2026-12-01", repo).item
    done = patch_item(repo, MILESTONE, "p1", item["milestone_id"],
                      MilestonePatch(base_version=1, op_id=uuid4(), completed=True), "a@x")
    assert done.kind == "applied" and done.item["completed_at"] is not None
    undone = patch_item(repo, MILESTONE, "p1", item["milestone_id"],
                        MilestonePatch(base_version=2, op_id=uuid4(), completed=False), "a@x")
    assert undone.item["completed_at"] is None


def test_completed_noop_does_not_write():
    repo = FakeItems()
    item = make("kickoff", "2026-12-01", repo).item
    writes = repo.writes
    r = patch_item(repo, MILESTONE, "p1", item["milestone_id"],
                   MilestonePatch(base_version=1, op_id=uuid4(), completed=False), "a@x")
    assert r.kind == "applied" and repo.writes == writes


# ------------------------------------------------------------------ links


class FakeLinks:
    def __init__(self, status="draft"):
        self.pov = pov(status)
        self.links: set[tuple[str, str]] = set()
        self.live = {"c1": {"pp1", "pp2"}}  # criterion -> pain points that exist
        self.ops: set[str] = set()

    def get_pov(self, pov_id):
        return self.pov if pov_id == "p1" else None

    def op_applied(self, pov_id, op_id, item_kind, item_id):
        return str(op_id) in self.ops

    def list_links(self, pov_id):
        return [{"criterion_id": c, "pain_point_id": p} for c, p in sorted(self.links)]

    def write_link(self, mode, *, pov_id, criterion_id, pain_point_id, actor, op_id):
        if pov_id != "p1" or self.pov.status not in ("draft", "collaborating"):
            return 0
        key = (criterion_id, pain_point_id)
        if mode == "add":
            if pain_point_id not in self.live.get(criterion_id, set()):
                return 6
            if key in self.links:
                return 4
            self.links.add(key)
            self.ops.add(op_id)
            return 1
        if criterion_id not in self.live or pain_point_id not in self.live[criterion_id]:
            return 6
        if key not in self.links:
            return 4
        self.links.discard(key)
        self.ops.add(op_id)
        return 1


def test_add_link_is_idempotent_set_semantics():
    repo = FakeLinks()
    a = change_link(repo, "add", "p1", "c1", "pp1", uuid4(), "a@x")
    b = change_link(repo, "add", "p1", "c1", "pp1", uuid4(), "a@x")
    assert a.kind == b.kind == "applied" and a.item == {"criterion_id": "c1", "pain_point_id": "pp1"}
    assert len(repo.links) == 1


def test_remove_link_twice_is_fine():
    repo = FakeLinks()
    change_link(repo, "add", "p1", "c1", "pp1", uuid4(), "a@x")
    assert change_link(repo, "remove", "p1", "c1", "pp1", uuid4(), "a@x").kind == "applied"
    assert change_link(repo, "remove", "p1", "c1", "pp1", uuid4(), "a@x").kind == "applied"
    assert not repo.links


def test_link_to_missing_things_is_not_found_and_frozen_plan_is_frozen():
    assert change_link(FakeLinks(), "add", "p1", "c1", "nope", uuid4(), "a@x").kind == "not_found"
    assert change_link(FakeLinks("locked"), "add", "p1", "c1", "pp1", uuid4(), "a@x").kind == "frozen"
    assert change_link(FakeLinks(), "add", "missing", "c1", "pp1", uuid4(), "a@x").kind in ("not_found", "frozen")


def test_list_links_unknown_pov_is_none():
    assert list_links(FakeLinks(), "missing") is None
    assert list_links(FakeLinks(), "p1") == []


def test_replayed_add_does_not_resurrect_a_removed_link():
    repo = FakeLinks()
    op = uuid4()
    change_link(repo, "add", "p1", "c1", "pp1", op, "a@x")
    change_link(repo, "remove", "p1", "c1", "pp1", uuid4(), "a@x")
    assert change_link(repo, "add", "p1", "c1", "pp1", op, "a@x").kind == "applied"  # late retry
    assert not repo.links


def test_remove_with_a_bad_id_is_not_found():
    assert change_link(FakeLinks(), "remove", "p1", "c1", "nope", uuid4(), "a@x").kind == "not_found"


def link_sql(mode):
    return build_link_script(
        mode, pov_table="p.d.pov", link_table="p.d.link", criterion_table="p.d.c", pain_point_table="p.d.pp",
        log_table="p.d.log", pov_id="p1", criterion_id="c1", pain_point_id="pp1", actor="a", op_id="o",
    )[0]


def test_link_sql_guards_against_replayed_ops_and_logs_old_and_new():
    for mode in ("add", "remove"):
        assert "op_id = @op_id" in link_sql(mode)
    assert "'all'" in link_sql("add")
    assert "@field, NULL, @pain_point_id" in link_sql("add")
    assert "@field, @pain_point_id, NULL" in link_sql("remove")


def test_cascade_logs_each_removed_link_before_removing_it():
    sql, _ = build(CRITERION, "delete", {}, base_version=1, cascade_tables={"criterion_pain_point": "p.d.link"})
    assert "'link_removed'" in sql
    assert sql.index("'link_removed'") < sql.index("UPDATE `p.d.link`")


def test_expected_seq_gates_the_write_and_reports_stale():
    sql, params = build(MILESTONE, "create", {"kind": "kickoff", "due_date": "2026-12-01"}, expected_seq=7)
    assert "seq = @expected_seq" in sql and "SET result = 2" in sql
    assert any(p.name == "expected_seq" and p.value == 7 for p in params)
    sql, params = build(MILESTONE, "create", {"kind": "kickoff", "due_date": "2026-12-01"})
    assert "expected_seq" not in sql


def test_duplicate_kind_wins_over_date_errors():
    repo = FakeItems()
    make("kickoff", "2026-12-01", repo)
    assert make("kickoff", "2027-06-01", repo).kind == "duplicate"


def test_milestone_write_is_stale_when_the_plan_changed_since_it_was_read():
    repo = FakeItems()
    make("kickoff", "2026-12-01", repo)
    repo.pov = repo.pov.model_copy(update={"seq": repo.pov.seq})
    orig = repo.get_pov

    def moving(pov_id):  # the plan changes right after the service reads it
        p = orig(pov_id)
        repo.pov = p.model_copy(update={"seq": p.seq + 1})
        return p

    repo.get_pov = moving
    assert make("checkpoint", "2026-12-15", repo).kind == "conflict"


def test_unchanged_due_date_is_not_a_write():
    repo = FakeItems()
    item = make("kickoff", "2026-12-01", repo).item
    writes = repo.writes
    r = patch_item(repo, MILESTONE, "p1", item["milestone_id"],
                   MilestonePatch(base_version=1, op_id=uuid4(), due_date="2026-12-01"), "a@x")
    assert r.kind == "applied" and repo.writes == writes
