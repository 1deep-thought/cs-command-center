"""Every route that changes a PoV is behind the editor guard, and the guard does what it says."""

from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from api._lib.auth import require_delphina
from api._lib.auth_core import Principal
from api.index import app
from api.pov_item_routes import get_item_repo
from api.pov_lock_routes import get_lock_repo
from api.pov_routes import get_repo, get_staff_check
from tests.test_pov_items import FakeItems
from tests.test_pov_lock import FakeLock
from tests.test_pov_service import FakeRepo

WRITES = {"POST", "PATCH", "PUT", "DELETE"}
# Writes that are not about one existing PoV, so there is no team to check.
NOT_ABOUT_ONE_POV = {("POST", "/api/py/pov")}  # create: the creator becomes its owner


def _guarded(dependant) -> bool:
    return any(getattr(d.call, "guards_pov_writes", False) or _guarded(d) for d in dependant.dependencies)


def test_every_pov_write_route_declares_the_editor_guard():
    unguarded, seen = [], 0
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith("/api/py/pov"):
            continue
        for method in route.methods & WRITES:
            if (method, route.path) in NOT_ABOUT_ONE_POV:
                continue
            seen += 1
            if not _guarded(route.dependant):
                unguarded.append(f"{method} {route.path}")
    assert seen >= 15  # guards against passing because nothing was found
    assert unguarded == []


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.clear()


def as_user(email, is_admin=False):
    app.dependency_overrides[require_delphina] = lambda: Principal(email=email, is_admin=is_admin)
    return TestClient(app)


def test_unassigned_staff_read_but_cannot_change_a_plan():
    repo = FakeItems()
    repo.members = [{"email": "ae@d.example", "role": "ae"}]
    app.dependency_overrides[get_item_repo] = lambda: repo
    colleague = as_user("colleague@d.example")
    assert colleague.get("/api/py/pov/p1/pain-points").status_code == 200
    r = colleague.post("/api/py/pov/p1/pain-points", json={"title": "x"})
    assert (r.status_code, r.json()["detail"]) == (403, "not_assigned") and repo.writes == 0
    # The owner is no longer enough once someone is assigned; the assigned person and an admin are.
    assert as_user("o@x").post("/api/py/pov/p1/pain-points", json={"title": "x"}).status_code == 403
    assert as_user("AE@d.example").post("/api/py/pov/p1/pain-points", json={"title": "x"}).status_code == 201
    assert as_user("boss@d.example", is_admin=True).post("/api/py/pov/p1/criteria", json={"statement": "s"}).status_code == 201


def test_assigned_se_moves_the_plan_and_others_cannot():
    repo = FakeLock("draft")
    repo.parts["members"] = [{"email": "se@d.example", "role": "se"}]
    app.dependency_overrides[get_lock_repo] = lambda: repo
    body = {"to": "collaborating", "op_id": str(uuid4())}
    assert as_user("colleague@d.example").post("/api/py/pov/p1/transitions", json=body).status_code == 403
    assert as_user("colleague@d.example").get("/api/py/pov/p1/readiness").json()["is_owner"] is False
    assert as_user("se@d.example").get("/api/py/pov/p1/readiness").json()["is_owner"] is True
    assert as_user("se@d.example").post("/api/py/pov/p1/transitions", json=body).json()["status"] == "collaborating"


def test_team_route_assigns_and_lists_staff():
    repo = FakeRepo()
    app.dependency_overrides[get_repo] = lambda: repo
    app.dependency_overrides[get_staff_check] = lambda: (lambda email: email.endswith("@delphina.example"))
    owner = as_user("a@delphina.example")
    pov = owner.post("/api/py/pov", json={"title": "Acme PoV", "prospect_name": "Acme"}).json()
    url = f"/api/py/pov/{pov['pov_id']}/team"
    r = owner.post(url, json={"se": "B@delphina.example", "op_id": str(uuid4())})
    assert r.status_code == 200 and r.json() == {"ae": None, "se": "b@delphina.example"}
    assert owner.post(url, json={"ae": "a@delphina.example", "op_id": str(uuid4())}).status_code == 403
    se = as_user("b@delphina.example")
    assert se.post(url, json={"ae": "x@acme.example", "op_id": str(uuid4())}).json()["detail"] == "not_staff"
    assert se.post(url, json={"op_id": str(uuid4())}).status_code == 422  # nothing to change
    both = se.post(url, json={"ae": "a@delphina.example", "se": None, "op_id": str(uuid4())})
    assert both.status_code == 200 and both.json() == {"ae": "a@delphina.example", "se": None}
    assert se.post("/api/py/pov/nope/team", json={"ae": None, "op_id": str(uuid4())}).status_code == 404
    assert se.get("/api/py/pov/staff").json() == [{"email": "a@delphina.example"}, {"email": "b@delphina.example"}]
