"""PoV rules and service, against an in-memory repo (no BigQuery, no FastAPI)."""

from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from api._lib.pov_models import PovCreate, PovListItem, PovOwnerView, PovPatch
from api._lib.pov_rules import ADMIN_FIELDS, invalid_changes, plan_is_editable
from api._lib.pov_service import create_pov, patch_pov

NOW = datetime(2026, 11, 22, tzinfo=timezone.utc)


class FakeRepo:
    def __init__(self):
        self.rows: dict[str, PovOwnerView] = {}
        self.ops: set = set()
        self.members: dict[str, list[dict]] = {}  # pov_id -> live pov_member rows
        self.team_log: list[tuple] = []
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

    def team(self, pov_id):
        row = self.rows.get(pov_id)
        return None if row is None else {"owner_email": row.owner_email, "members": list(self.members.get(pov_id, []))}

    def write_team(self, *, pov_id, changes, actor, op_id):
        for role, (old, email) in sorted(changes.items()):
            kept = [m for m in self.members.get(pov_id, []) if m["role"] != role]
            self.members[pov_id] = kept + ([{"email": email, "role": role}] if email else [])
            self.team_log.append((role, old, email, actor))

    def staff(self):
        return [{"email": "a@delphina.example"}, {"email": "b@delphina.example"}]

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
            update={
                **changes,
                "version": row.version + 1,
                "seq": row.seq + (0 if set(changes) <= ADMIN_FIELDS else 1),  # as build_patch_script does
                "updated_by": actor,
            }
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


# ------------------------------------------------------------------ account link and handover

STAFF = {"a@delphina.example", "b@delphina.example"}


def is_staff(email):
    return email in STAFF


@pytest.mark.parametrize("status", ["locked", "decided"])
def test_account_link_and_owner_may_change_after_lock(repo, pov, status):
    repo.rows[pov.pov_id] = pov.model_copy(update={"status": status})
    r = patch_pov(repo, pov.pov_id, patch(account_id="acct_123"), "b@delphina.example")
    assert r.kind == "applied" and r.pov.account_id == "acct_123"
    r = patch_pov(repo, pov.pov_id, patch(base_version=2, owner_email="b@delphina.example"), "a@delphina.example", is_staff=is_staff)
    assert r.kind == "applied" and r.pov.owner_email == "b@delphina.example"
    # ...but a plan field sent alongside is still refused.
    mixed = patch(base_version=3, account_id="acct_9", title="Nope")
    assert patch_pov(repo, pov.pov_id, mixed, "b@delphina.example").kind == "frozen"


def test_only_owner_or_admin_hands_a_plan_over(repo, pov):
    hand = lambda: patch(owner_email="b@delphina.example")  # noqa: E731
    r = patch_pov(repo, pov.pov_id, hand(), "b@delphina.example", is_staff=is_staff)
    assert (r.kind, r.code) == ("forbidden", "owner_only")
    assert repo.rows[pov.pov_id].owner_email == "a@delphina.example"
    r = patch_pov(repo, pov.pov_id, hand(), "b@delphina.example", is_admin=True, is_staff=is_staff)
    assert r.kind == "applied" and r.pov.owner_email == "b@delphina.example"


def test_new_owner_must_have_access(repo, pov):
    r = patch_pov(repo, pov.pov_id, patch(owner_email="Stranger@Example.com"), "a@delphina.example", is_staff=is_staff)
    assert (r.kind, r.code) == ("invalid", "owner_not_staff")
    # No way to check access: refuse, never guess.
    r = patch_pov(repo, pov.pov_id, patch(owner_email="b@delphina.example"), "a@delphina.example")
    assert (r.kind, r.code) == ("invalid", "owner_not_staff")


def test_same_owner_is_not_a_handover(repo, pov):
    # Anyone may send the unchanged owner along with another field (the details form does).
    r = patch_pov(repo, pov.pov_id, patch(title="Renamed", owner_email="A@delphina.example"), "b@delphina.example")
    assert r.kind == "applied" and r.pov.title == "Renamed" and r.pov.owner_email == "a@delphina.example"
    only = patch_pov(repo, pov.pov_id, patch(base_version=2, owner_email="a@delphina.example"), "b@delphina.example")
    assert only.kind == "applied" and only.pov.version == 2  # nothing written


def test_owner_cannot_be_cleared():
    with pytest.raises(ValidationError):
        PovPatch(base_version=1, op_id=uuid4(), owner_email=None)
    with pytest.raises(ValidationError):
        PovPatch(base_version=1, op_id=uuid4(), owner_email="not-an-email")


def test_account_link_and_handover_do_not_count_as_plan_changes(repo, pov):
    # seq is what a recorded Sponsor agreement is checked against: these must not move it.
    r = patch_pov(repo, pov.pov_id, patch(account_id="acct_1"), "a@delphina.example")
    assert (r.pov.seq, r.pov.version) == (1, 2)
    r = patch_pov(repo, pov.pov_id, patch(base_version=2, owner_email="b@delphina.example"), "a@delphina.example", is_staff=is_staff)
    assert (r.pov.seq, r.pov.version) == (1, 3)
    r = patch_pov(repo, pov.pov_id, patch(base_version=3, account_id="acct_2", title="Renamed"), "a@delphina.example")
    assert (r.pov.seq, r.pov.version) == (2, 4)


def test_non_owner_cannot_slip_a_handover_in_with_another_field(repo, pov):
    p = patch(title="Renamed", owner_email="b@delphina.example")
    assert patch_pov(repo, pov.pov_id, p, "b@delphina.example", is_staff=is_staff).kind == "forbidden"
    assert repo.rows[pov.pov_id].title == "Acme PoV" and repo.rows[pov.pov_id].version == 1
    # Replaying the refused operation writes nothing either.
    assert patch_pov(repo, pov.pov_id, p, "b@delphina.example", is_staff=is_staff).kind == "forbidden"
    assert repo.rows[pov.pov_id].owner_email == "a@delphina.example"


def test_locked_plan_stays_frozen_when_the_unchanged_owner_rides_along(repo, pov):
    repo.rows[pov.pov_id] = pov.model_copy(update={"status": "locked"})
    p = patch(title="Nope", owner_email="a@delphina.example")
    assert patch_pov(repo, pov.pov_id, p, "a@delphina.example", is_staff=is_staff).kind == "frozen"
