"""PoV rules and service, against an in-memory repo (no BigQuery, no FastAPI)."""

from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from api._lib.pov_models import PovCreate, PovListItem, PovOwnerView, PovPatch
from api._lib.pov_rules import invalid_changes, plan_is_editable
from api._lib.pov_service import create_pov, patch_pov

NOW = datetime(2026, 11, 22, tzinfo=timezone.utc)


class FakeRepo:
    def __init__(self):
        self.rows: dict[str, PovOwnerView] = {}
        self.ops: set = set()
        self.race_next = False  # simulate another writer winning between read and write
        self.race_is_twin = False  # ...and that writer being a retry of this very operation

    def insert(self, pov_id, data, owner_email):
        self.rows[pov_id] = PovOwnerView(
            pov_id=pov_id, title=data.title, prospect_name=data.prospect_name,
            prospect_domain=data.prospect_domain, status="draft", decision=None,
            currency=data.currency, start_date=data.start_date, end_date=data.end_date,
            baseline_end_date=None, go_threshold=None, no_go_threshold=None,
            owner_email=owner_email, account_id=data.account_id, seq=1, version=1,
            created_by=owner_email, created_at=NOW, updated_by=owner_email, updated_at=NOW,
        )

    def get(self, pov_id):
        return self.rows.get(pov_id)

    def list(self) -> list[PovListItem]:
        return []

    def op_applied(self, pov_id, op_id):
        return (pov_id, op_id) in self.ops

    def apply_patch(self, pov_id, *, base_version, op_id, actor, changes, old):
        row = self.rows[pov_id]
        if self.race_next:
            self.race_next = False
            if self.race_is_twin:
                self.ops.add((pov_id, op_id))  # the same operation committed concurrently
            self.rows[pov_id] = row.model_copy(update={"version": row.version + 1})
            return False
        if row.version != base_version:
            return False
        self.rows[pov_id] = row.model_copy(
            update={**changes, "version": row.version + 1, "seq": row.seq + 1, "updated_by": actor}
        )
        self.ops.add((pov_id, op_id))
        return True


@pytest.fixture
def repo():
    return FakeRepo()


@pytest.fixture
def pov(repo):
    return create_pov(repo, PovCreate(title="Acme PoV", prospect_name="Acme"), "a@delphina.example")


def patch(base_version=1, **fields):
    return PovPatch(base_version=base_version, op_id=uuid4(), **fields)


def test_create_starts_in_draft_at_version_1(pov):
    assert (pov.status, pov.version, pov.seq) == ("draft", 1, 1)
    assert pov.owner_email == "a@delphina.example"


def test_patch_changes_only_sent_fields_and_bumps_version(repo, pov):
    r = patch_pov(repo, pov.pov_id, patch(title="Acme expansion PoV"), "b@delphina.example")
    assert r.kind == "applied"
    assert r.pov.title == "Acme expansion PoV"
    assert r.pov.prospect_name == "Acme"
    assert r.pov.version == 2 and r.pov.updated_by == "b@delphina.example"


def test_stale_version_conflicts_and_returns_current(repo, pov):
    patch_pov(repo, pov.pov_id, patch(title="First"), "a@delphina.example")
    r = patch_pov(repo, pov.pov_id, patch(base_version=1, title="Second"), "b@delphina.example")
    assert r.kind == "conflict"
    assert r.pov.title == "First"


def test_retrying_an_applied_operation_succeeds(repo, pov):
    p = patch(title="Once")
    assert patch_pov(repo, pov.pov_id, p, "a@delphina.example").kind == "applied"
    again = patch_pov(repo, pov.pov_id, p, "a@delphina.example")
    assert again.kind == "applied"
    assert again.pov.version == 2  # not applied twice


def test_losing_the_race_at_write_time_is_a_conflict(repo, pov):
    repo.race_next = True
    assert patch_pov(repo, pov.pov_id, patch(title="Late"), "a@delphina.example").kind == "conflict"


@pytest.mark.parametrize("status", ["locked", "decided"])
def test_locked_plan_is_frozen(repo, pov, status):
    repo.rows[pov.pov_id] = pov.model_copy(update={"status": status})
    assert patch_pov(repo, pov.pov_id, patch(title="Nope"), "a@delphina.example").kind == "frozen"


def test_missing_pov_is_not_found(repo):
    assert patch_pov(repo, "nope", patch(title="x"), "a@delphina.example").kind == "not_found"


def test_end_before_start_is_invalid_even_across_fields(repo, pov):
    repo.rows[pov.pov_id] = pov.model_copy(update={"start_date": date(2026, 12, 10)})
    r = patch_pov(repo, pov.pov_id, patch(end_date=date(2026, 12, 1)), "a@delphina.example")
    assert (r.kind, r.code) == ("invalid", "invalid_dates")


def test_go_threshold_must_exceed_no_go(repo, pov):
    r = patch_pov(repo, pov.pov_id, patch(go_threshold=60, no_go_threshold=80), "a@delphina.example")
    assert (r.kind, r.code) == ("invalid", "invalid_thresholds")
    ok = patch_pov(repo, pov.pov_id, patch(go_threshold=80, no_go_threshold=60), "a@delphina.example")
    assert ok.kind == "applied"


def test_nullable_field_can_be_cleared_but_required_one_cannot():
    assert PovPatch(base_version=1, op_id=uuid4(), prospect_domain=None).changes() == {"prospect_domain": None}
    with pytest.raises(ValidationError):
        PovPatch(base_version=1, op_id=uuid4(), title=None)


def test_empty_patch_and_unknown_fields_are_rejected():
    with pytest.raises(ValidationError):
        PovPatch(base_version=1, op_id=uuid4())
    with pytest.raises(ValidationError):
        PovPatch(base_version=1, op_id=uuid4(), title="x", status="locked")  # status is not patchable
    with pytest.raises(ValidationError):
        PovPatch(base_version=0, op_id=uuid4(), title="x")


def test_create_validation():
    with pytest.raises(ValidationError):
        PovCreate(title="  ", prospect_name="Acme")
    with pytest.raises(ValidationError):
        PovCreate(title="t", prospect_name="Acme", currency="usd")
    with pytest.raises(ValidationError):
        PovCreate(title="t", prospect_name="Acme", prospect_domain="not a domain")
    assert PovCreate(title="t", prospect_name="Acme", prospect_domain=" ACME.com ").prospect_domain == "acme.com"
    with pytest.raises(ValidationError):
        PovCreate(title="t", prospect_name="A", start_date=date(2026, 2, 1), end_date=date(2026, 1, 1))


def test_rules_helpers():
    assert plan_is_editable("draft") and plan_is_editable("collaborating")
    assert not plan_is_editable("locked") and not plan_is_editable("decided")
    assert invalid_changes(current_start=None, current_end=None, current_go=None, current_no_go=None, changes={}) is None


def test_twin_request_that_loses_the_race_still_reports_success(repo, pov):
    repo.race_next = True
    repo.race_is_twin = True
    assert patch_pov(repo, pov.pov_id, patch(title="Twin"), "a@delphina.example").kind == "applied"


def test_create_with_same_op_id_is_idempotent(repo):
    op = uuid4()
    first = create_pov(repo, PovCreate(op_id=op, title="T", prospect_name="A"), "a@delphina.example")
    again = create_pov(repo, PovCreate(op_id=op, title="T", prospect_name="A"), "a@delphina.example")
    assert first.pov_id == again.pov_id == str(op)
    assert len(repo.rows) == 1
