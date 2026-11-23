"""Child items: models, SQL builder, and service rules against an in-memory repo."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from api._lib.pov_item_service import create_item, delete_item, list_items, patch_item
from api._lib.pov_item_specs import CRITERION, PAIN_POINT, STAKEHOLDER
from api._lib.pov_item_sql import build_write_script
from api._lib.pov_items import PainPointCreate, PainPointPatch, StakeholderCreate, StakeholderPatch
from api._lib.pov_models import PovOwnerView

NOW = datetime(2026, 11, 22, tzinfo=timezone.utc)


def pov(status="draft"):
    return PovOwnerView(
        pov_id="p1", title="t", prospect_name="a", prospect_domain=None, status=status, decision=None,
        currency="USD", start_date=None, end_date=None, baseline_end_date=None, go_threshold=None,
        no_go_threshold=None, owner_email="o@x", account_id=None, seq=1, version=1,
        created_by="o@x", created_at=NOW, updated_by="o@x", updated_at=NOW,
    )


class FakeItems:
    """Mimics the transaction script's result codes."""

    def __init__(self, status="draft"):
        self.pov = pov(status)
        self.items: dict[tuple[str, str], dict] = {}
        self.ops: set = set()
        self.writes = 0
        self.dead: set = set()

    def get_pov(self, pov_id):
        return self.pov if pov_id == "p1" else None

    def op_applied(self, pov_id, op_id, item_kind=None, item_id=None):
        if item_kind is None:
            return any(o[0] == op_id for o in self.ops)
        return (op_id, item_kind, item_id) in self.ops

    def list_items(self, spec, pov_id):
        return [v for (k, _), v in self.items.items() if k == spec.kind]

    def get_item(self, spec, pov_id, item_id):
        return self.items.get((spec.kind, item_id))

    def write_item(self, spec, mode, *, pov_id, item_id, actor, op_id, values, old, base_version, expected_seq=None):
        self.writes += 1
        if expected_seq is not None and expected_seq != self.pov.seq:
            return 2
        if self.pov.status not in ("draft", "collaborating"):
            return 0
        key = (spec.kind, item_id)
        if mode == "create":
            if key in self.items or key in self.dead:
                return 4  # id already used, live or soft-deleted
            if len(self.list_items(spec, pov_id)) >= (spec.max_items or 10**9):
                return 3
            # Like the real table: every column the view needs is present, unset ones are NULL.
            row = dict.fromkeys(spec.view_columns)
            row.update(created_by=actor, updated_by=actor, created_at=NOW, updated_at=NOW)
            row.update({spec.id_column: item_id, "pov_id": pov_id, "version": 1, **values})
            if spec.ordered:
                row["position"] = float(len(self.list_items(spec, pov_id)) + 1)
            self.items[key] = row
        else:
            row = self.items.get(key)
            if row is None or row["version"] != base_version:
                return 2
            if mode == "delete":
                del self.items[key]
                self.dead.add(key)
            else:
                row.update(values, version=row["version"] + 1)
        self.ops.add((UUID(op_id), spec.kind, item_id))
        return 1


# ------------------------------------------------------------------ models


def test_pain_point_value_range_needs_both_bounds_in_order():
    with pytest.raises(ValidationError):
        PainPointCreate(title="x", value_low_minor=5)
    with pytest.raises(ValidationError):
        PainPointCreate(title="x", value_low_minor=9, value_high_minor=5)
    assert PainPointCreate(title="x", value_low_minor=5, value_high_minor=9)


def test_patch_rejects_empty_and_unknown_fields():
    with pytest.raises(ValidationError):
        PainPointPatch(base_version=1, op_id=uuid4())
    with pytest.raises(ValidationError):
        PainPointPatch(base_version=1, op_id=uuid4(), title="x", hacker="y")
    with pytest.raises(ValidationError):
        PainPointPatch(base_version=1, op_id=uuid4(), title=None)


def test_stakeholder_role_rules():
    assert StakeholderCreate(name="A", roles=["sponsor", "champion"])
    for roles in (["sponsor", "evaluator"], ["sponsor", "sponsor"], ["sponsor", "champion", "evaluator"]):
        with pytest.raises(ValidationError):
            StakeholderCreate(name="A", roles=roles)
    with pytest.raises(ValidationError):
        StakeholderPatch(base_version=1, op_id=uuid4(), roles=["sponsor", "evaluator"])


def test_stakeholder_email_is_normalized():
    assert StakeholderCreate(name="A", email=" Sam@Acme.COM ").email == "sam@acme.com"


# --------------------------------------------------------------------- SQL


def build(spec, mode, values, **kw):
    return build_write_script(
        spec, mode, pov_table="p.d.pov", item_table="p.d.item", log_table="p.d.log", pov_id="p1",
        item_id="i1", actor="a", op_id="o", values=values, old_json="{}", new_json="{}", **kw,
    )


def test_sql_columns_only_come_from_the_spec():
    with pytest.raises(ValueError):
        build(PAIN_POINT, "update", {"title; DROP TABLE x": "y"}, base_version=1)
    sql, params = build(PAIN_POINT, "update", {"title": "y"}, base_version=3)
    assert "title = @v_title" in sql and "version = @base_version" in sql
    assert {p.name for p in params} >= {"v_title", "base_version", "pov_id", "item_id", "op_id"}


def test_sql_gates_on_plan_status_and_logs_in_the_same_transaction():
    sql, _ = build(PAIN_POINT, "create", {"title": "t"})
    assert "status IN ('draft', 'collaborating')" in sql
    assert sql.index("BEGIN TRANSACTION") < sql.index("p.d.log") < sql.index("COMMIT TRANSACTION")
    assert "ROLLBACK TRANSACTION" in sql


def test_sql_unordered_stakeholders_have_no_position_and_delete_is_soft():
    sql, _ = build(STAKEHOLDER, "create", {"name": "n"})
    assert "position" not in sql
    sql, _ = build(PAIN_POINT, "delete", {}, base_version=1, cascade_tables={"criterion_pain_point": "p.d.link"})
    assert "deleted_at = CURRENT_TIMESTAMP()" in sql and "DELETE FROM" not in sql


def test_sql_update_and_delete_need_base_version():
    with pytest.raises(ValueError):
        build(PAIN_POINT, "delete", {})


def test_limits_are_per_kind():
    assert (PAIN_POINT.max_items, STAKEHOLDER.max_items, CRITERION.max_items) == (5, 25, 6)


# ----------------------------------------------------------------- service


def test_create_then_retry_is_idempotent():
    repo, op = FakeItems(), uuid4()
    first = create_item(repo, PAIN_POINT, "p1", PainPointCreate(op_id=op, title="Slow reports"), "a@x")
    again = create_item(repo, PAIN_POINT, "p1", PainPointCreate(op_id=op, title="Slow reports"), "a@x")
    assert first.kind == again.kind == "applied" and repo.writes == 1


def test_create_defaults_and_value_source():
    repo = FakeItems()
    r = create_item(repo, PAIN_POINT, "p1", PainPointCreate(title="x", value_low_minor=1, value_high_minor=2), "a")
    assert r.item["value_source"] == "prospect_stated"
    s = create_item(repo, STAKEHOLDER, "p1", StakeholderCreate(name="Sam"), "a")
    assert s.item["is_active"] is True


def test_limit_frozen_and_missing_pov():
    repo = FakeItems()
    for i in range(5):
        assert create_item(repo, PAIN_POINT, "p1", PainPointCreate(title=f"t{i}"), "a").kind == "applied"
    assert create_item(repo, PAIN_POINT, "p1", PainPointCreate(title="six"), "a").kind == "limit"
    assert create_item(repo, PAIN_POINT, "nope", PainPointCreate(title="x"), "a").kind == "not_found"
    assert create_item(FakeItems("locked"), PAIN_POINT, "p1", PainPointCreate(title="x"), "a").kind == "frozen"
    assert list_items(repo, PAIN_POINT, "nope") is None


def test_patch_conflict_retry_and_value_rules():
    repo = FakeItems()
    item = create_item(repo, PAIN_POINT, "p1", PainPointCreate(title="x"), "a").item
    iid = item["pain_point_id"]
    op = uuid4()
    ok = patch_item(repo, PAIN_POINT, "p1", iid, PainPointPatch(base_version=1, op_id=op, title="y"), "a")
    assert ok.kind == "applied" and ok.item["version"] == 2
    # same operation again: success, not a conflict
    assert patch_item(repo, PAIN_POINT, "p1", iid, PainPointPatch(base_version=1, op_id=op, title="y"), "a").kind == "applied"
    # a different operation on the stale version conflicts and returns the current item
    stale = patch_item(repo, PAIN_POINT, "p1", iid, PainPointPatch(base_version=1, op_id=uuid4(), title="z"), "a")
    assert stale.kind == "conflict" and stale.item["title"] == "y"
    # setting only one bound is invalid after the merge
    bad = patch_item(repo, PAIN_POINT, "p1", iid, PainPointPatch(base_version=2, op_id=uuid4(), value_low_minor=5), "a")
    assert bad.kind == "invalid" and bad.code == "invalid_value_range"


def test_verifying_stamps_the_verifier_and_editing_numbers_voids_it():
    repo = FakeItems()
    made = create_item(repo, PAIN_POINT, "p1", PainPointCreate(title="x", value_low_minor=1, value_high_minor=2, value_basis="Q3 ops data"), "a")
    iid = made.item["pain_point_id"]
    v = patch_item(repo, PAIN_POINT, "p1", iid, PainPointPatch(base_version=1, op_id=uuid4(), value_source="verified"), "boss@x")
    assert v.item["value_source"] == "verified" and v.item["verified_by"] == "boss@x" and v.item["verified_at"]
    e = patch_item(repo, PAIN_POINT, "p1", iid, PainPointPatch(base_version=2, op_id=uuid4(), value_high_minor=9), "a")
    assert e.item["value_source"] == "prospect_stated" and e.item["verified_by"] is None


def test_delete_paths():
    repo = FakeItems()
    iid = create_item(repo, STAKEHOLDER, "p1", StakeholderCreate(name="Sam"), "a").item["stakeholder_id"]
    assert delete_item(repo, STAKEHOLDER, "p1", iid, base_version=9, op_id=uuid4(), actor="a").kind == "conflict"
    op = uuid4()
    assert delete_item(repo, STAKEHOLDER, "p1", iid, base_version=1, op_id=op, actor="a").kind == "applied"
    assert delete_item(repo, STAKEHOLDER, "p1", iid, base_version=1, op_id=op, actor="a").kind == "applied"  # retry
    assert delete_item(repo, STAKEHOLDER, "p1", iid, base_version=1, op_id=uuid4(), actor="a").kind == "not_found"


# ------------------------------------------------- council review fixes


def test_every_request_field_is_a_known_column():
    for spec in (PAIN_POINT, STAKEHOLDER, CRITERION):
        for model in (spec.create, spec.patch):
            fields = set(model.model_fields) - {"op_id", "base_version"}
            assert fields <= set(spec.fields), (spec.kind, fields - set(spec.fields))


def test_create_twin_after_the_limit_is_applied_not_full():
    repo = FakeItems()
    ops = [uuid4() for _ in range(5)]
    for op in ops:
        create_item(repo, PAIN_POINT, "p1", PainPointCreate(op_id=op, title="t"), "a")
    twin = create_item(repo, PAIN_POINT, "p1", PainPointCreate(op_id=ops[-1], title="t"), "a")
    assert twin.kind == "applied"


def test_create_race_loser_sees_applied_via_the_script_code():
    class Racy(FakeItems):
        def get_item(self, spec, pov_id, item_id):  # pre-check misses: the twin commits in between
            return None if self._hide else super().get_item(spec, pov_id, item_id)

        _hide = True

        def write_item(self, *a, **kw):
            self._hide = False
            self.items[(a[0].kind, kw["item_id"])] = {**dict.fromkeys(a[0].view_columns), "version": 1, "title": "t"}
            self.ops.add((UUID(kw["op_id"]), a[0].kind, kw["item_id"]))
            return 4

    op = uuid4()
    r = create_item(Racy(), PAIN_POINT, "p1", PainPointCreate(op_id=op, title="t"), "a")
    assert r.kind == "applied" and r.item["title"] == "t"


def test_reusing_an_op_id_on_another_item_is_not_silently_dropped():
    repo = FakeItems()
    a = create_item(repo, STAKEHOLDER, "p1", StakeholderCreate(name="A"), "a").item
    b = create_item(repo, STAKEHOLDER, "p1", StakeholderCreate(name="B"), "a").item
    op = uuid4()
    first = patch_item(repo, STAKEHOLDER, "p1", a["stakeholder_id"], StakeholderPatch(base_version=1, op_id=op, name="A2"), "a")
    second = patch_item(repo, STAKEHOLDER, "p1", b["stakeholder_id"], StakeholderPatch(base_version=1, op_id=op, name="B2"), "a")
    assert first.item["name"] == "A2" and second.item["name"] == "B2"  # B really changed


def test_patch_of_an_item_deleted_meanwhile_is_not_found():
    class Vanishing(FakeItems):
        def write_item(self, spec, mode, **kw):
            if mode == "create":
                return super().write_item(spec, mode, **kw)
            self.items.pop((spec.kind, kw["item_id"]))
            return 2

    repo = Vanishing()
    iid = create_item(repo, STAKEHOLDER, "p1", StakeholderCreate(name="A"), "a").item["stakeholder_id"]
    r = patch_item(repo, STAKEHOLDER, "p1", iid, StakeholderPatch(base_version=1, op_id=uuid4(), name="Z"), "a")
    assert r.kind == "not_found"


def make_pain(repo, **kw):
    return create_item(repo, PAIN_POINT, "p1", PainPointCreate(title="x", **kw), "a").item["pain_point_id"]


def test_cannot_verify_without_numbers_and_basis():
    repo = FakeItems()
    nums = dict(value_low_minor=1, value_high_minor=2)
    iid = make_pain(repo, **nums)
    r = patch_item(repo, PAIN_POINT, "p1", iid, PainPointPatch(base_version=1, op_id=uuid4(), value_source="verified"), "b")
    assert r.kind == "invalid" and r.code == "verification_needs_value_and_basis"
    bare = make_pain(repo)
    r = patch_item(repo, PAIN_POINT, "p1", bare, PainPointPatch(base_version=1, op_id=uuid4(), value_source="verified"), "b")
    assert r.kind == "invalid"
    ok = patch_item(repo, PAIN_POINT, "p1", iid, PainPointPatch(base_version=1, op_id=uuid4(), value_basis="Q3 ops data", value_source="verified"), "b")
    assert ok.kind == "applied" and ok.item["verified_by"] == "b"


def test_resending_verified_does_not_restamp_and_adding_numbers_sets_a_source():
    repo = FakeItems()
    iid = make_pain(repo, value_low_minor=1, value_high_minor=2, value_basis="b")
    first = patch_item(repo, PAIN_POINT, "p1", iid, PainPointPatch(base_version=1, op_id=uuid4(), value_source="verified"), "one")
    again = patch_item(repo, PAIN_POINT, "p1", iid, PainPointPatch(base_version=2, op_id=uuid4(), value_source="verified"), "two")
    assert again.item["verified_by"] == "one" and again.item["verified_at"] == first.item["verified_at"]
    bare = make_pain(repo)
    added = patch_item(repo, PAIN_POINT, "p1", bare, PainPointPatch(base_version=1, op_id=uuid4(), value_low_minor=1, value_high_minor=3), "a")
    assert added.item["value_source"] == "prospect_stated"
    cleared = patch_item(repo, PAIN_POINT, "p1", bare, PainPointPatch(base_version=2, op_id=uuid4(), value_low_minor=None, value_high_minor=None), "a")
    assert cleared.item["value_source"] is None
