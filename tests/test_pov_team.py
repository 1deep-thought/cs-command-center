"""Who may change a PoV, and assigning its Account Executive and Solution Engineer."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from api._lib.pov_lock_service import get_plan, get_readiness, transition
from api._lib.pov_models import PovCreate, TeamAssign, TransitionIn
from api._lib.pov_rules import may_edit, team_of
from api._lib.pov_service import create_pov
from api._lib.pov_team import assign, can_edit
from tests.test_pov_lock import OWNER, FakeLock, ready_parts
from tests.test_pov_service import FakeRepo

AE, SE = {"email": "ae@d.example", "role": "ae"}, {"email": "SE@d.example ", "role": "se"}


def allowed(actor, members=(), is_admin=False, owner="owner@d.example"):
    return may_edit(actor=actor, is_admin=is_admin, owner_email=owner, members=list(members))


def test_team_of_reads_the_two_roles_lowercased():
    assert team_of([AE, SE]) == {"ae": "ae@d.example", "se": "se@d.example"}
    assert team_of([]) == {"ae": None, "se": None}
    assert team_of([{"email": "p@acme.example", "role": "prospect"}]) == {"ae": None, "se": None}


def test_admin_and_the_assigned_ae_and_se_may_edit():
    assert allowed("anyone@d.example", [AE, SE], is_admin=True)
    assert allowed("AE@d.example", [AE, SE]) and allowed("se@d.example", [AE, SE])
    assert not allowed("colleague@d.example", [AE, SE])


def test_once_someone_is_assigned_the_owner_alone_is_not_enough():
    assert not allowed("owner@d.example", [AE])
    assert allowed("ae@d.example", [AE])


def test_a_plan_with_nobody_assigned_falls_back_to_its_owner():
    assert allowed("Owner@d.example") and not allowed("colleague@d.example")
    # Prospect members never count as the Delphina team.
    assert allowed("owner@d.example", [{"email": "p@acme.example", "role": "prospect"}])
    assert not allowed("p@acme.example", [{"email": "p@acme.example", "role": "prospect"}])


# ------------------------------------------------------------------ assigning


def staffed(email):
    return email.endswith("@delphina.example")


@pytest.fixture
def repo():
    r = FakeRepo()
    r.pov = create_pov(r, PovCreate(title="Acme PoV", prospect_name="Acme"), "a@delphina.example")
    return r


def put(repo, role, email, actor="a@delphina.example", **kw):
    body = TeamAssign(**{role: email}, op_id=uuid4())
    return assign(repo, repo.pov.pov_id, body, actor, is_staff=staffed, **kw)


def test_owner_assigns_the_team_and_then_they_hold_the_plan(repo):
    r = put(repo, "se", "B@delphina.example")
    assert r.kind == "applied" and r.team == {"ae": None, "se": "b@delphina.example"}
    state = repo.team(repo.pov.pov_id)
    assert can_edit(state, "b@delphina.example", False)
    # The creator is no longer on the plan unless assigned too.
    assert not can_edit(state, "a@delphina.example", False)
    assert put(repo, "ae", "a@delphina.example").kind == "forbidden"
    assert put(repo, "ae", "a@delphina.example", actor="b@delphina.example").team == {"ae": "a@delphina.example", "se": "b@delphina.example"}
    assert repo.team_log[-1] == ("ae", None, "a@delphina.example", "b@delphina.example")


def test_reassigning_replaces_and_clearing_removes(repo):
    put(repo, "ae", "a@delphina.example")
    assert put(repo, "ae", "c@delphina.example").team["ae"] == "c@delphina.example"
    assert len([m for m in repo.members[repo.pov.pov_id] if m["role"] == "ae"]) == 1
    assert put(repo, "ae", None, actor="c@delphina.example").team == {"ae": None, "se": None}


def test_same_person_again_writes_nothing(repo):
    put(repo, "ae", "a@delphina.example")
    before = len(repo.team_log)
    assert put(repo, "ae", "a@delphina.example").kind == "applied" and len(repo.team_log) == before


def test_only_delphina_staff_can_be_assigned(repo):
    r = put(repo, "ae", "someone@acme.example")
    assert (r.kind, r.code) == ("invalid", "not_staff") and repo.team_log == []
    body = TeamAssign(ae="a@delphina.example", op_id=uuid4())
    assert assign(repo, repo.pov.pov_id, body, "a@delphina.example").code == "not_staff"  # no way to check: refuse


def test_unassigned_staff_cannot_assign_but_an_admin_can(repo):
    assert put(repo, "ae", "b@delphina.example", actor="b@delphina.example").kind == "forbidden"
    assert put(repo, "ae", "b@delphina.example", actor="boss@delphina.example", is_admin=True).kind == "applied"
    assert assign(repo, "nope", TeamAssign(ae=None, op_id=uuid4()), "a@delphina.example").kind == "not_found"


def test_role_is_ae_or_se_only():
    with pytest.raises(ValidationError):
        TeamAssign(prospect="p@acme.example", op_id=uuid4())
    with pytest.raises(ValidationError):
        TeamAssign(ae="not-an-email", op_id=uuid4())
    with pytest.raises(ValidationError):
        TeamAssign(op_id=uuid4())  # nothing to change
    assert TeamAssign(ae=None, op_id=uuid4()).changes() == {"ae": None}  # null clears; absent is untouched


def test_both_roles_change_in_one_request_even_when_it_removes_the_caller(repo):
    # The owner hands the plan to an AE and an SE in one go. Sent as two requests, the first
    # would end the owner's right to send the second.
    body = TeamAssign(ae="b@delphina.example", se="c@delphina.example", op_id=uuid4())
    r = assign(repo, repo.pov.pov_id, body, "a@delphina.example", is_staff=staffed)
    assert r.kind == "applied" and r.team == {"ae": "b@delphina.example", "se": "c@delphina.example"}
    assert [entry[0] for entry in repo.team_log] == ["ae", "se"]
    assert not can_edit(repo.team(repo.pov.pov_id), "a@delphina.example", False)
    # One bad name refuses the whole request: nothing half-applied.
    bad = TeamAssign(ae="a@delphina.example", se="x@acme.example", op_id=uuid4())
    assert assign(repo, repo.pov.pov_id, bad, "b@delphina.example", is_staff=staffed).code == "not_staff"
    assert repo.team(repo.pov.pov_id)["members"] == [{"email": "b@delphina.example", "role": "ae"}, {"email": "c@delphina.example", "role": "se"}]


# ------------------------------------------------------------------ the plan knows who may act


def test_plan_and_readiness_say_whether_the_viewer_may_act():
    parts = {**ready_parts(), "members": [AE, SE]}
    repo = FakeLock("collaborating", parts=parts)
    plan = get_plan(repo, "p1", "se@d.example")
    assert plan["team"] == {"ae": "ae@d.example", "se": "se@d.example"} and plan["readiness"].is_owner
    assert not get_readiness(repo, "p1", OWNER).is_owner  # the old owner, now that a team is assigned
    assert get_readiness(repo, "p1", "colleague@d.example").allowed_transitions == []
    assert get_readiness(repo, "p1", "boss@d.example", is_admin=True).is_owner


def test_transition_takes_the_routes_decision():
    body = lambda: TransitionIn(to="collaborating", op_id=uuid4())  # noqa: E731
    assert transition(FakeLock("draft"), "p1", body(), "se@d.example", may_act=True).kind == "applied"
    assert transition(FakeLock("draft"), "p1", body(), OWNER, may_act=False).kind == "forbidden"
    assert transition(FakeLock("draft"), "p1", body(), OWNER).kind == "applied"  # no decision given: the owner rule
