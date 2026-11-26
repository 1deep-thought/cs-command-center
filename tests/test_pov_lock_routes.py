"""Readiness and transition HTTP contract, with an in-memory repo behind the real FastAPI app."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from api._lib.auth import require_delphina
from api._lib.auth_core import Principal
from api.index import app
from api.pov_lock_routes import get_lock_repo
from tests.test_pov_lock import OWNER, FakeLock

URL = "/api/py/pov/p1"


def client_for(repo, email=OWNER):
    app.dependency_overrides[require_delphina] = lambda: Principal(email=email, is_admin=False)
    app.dependency_overrides[get_lock_repo] = lambda: repo
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def lock(c, **fields):
    return c.post(f"{URL}/transitions", json={"to": "locked", "op_id": str(uuid4()), **fields})


def test_readiness_lists_the_six_checks():
    r = client_for(FakeLock(agreed=False)).get(f"{URL}/readiness")
    body = r.json()
    assert r.status_code == 200 and (body["passed"], body["total"], body["ready"]) == (5, 6, False)
    assert [c["key"] for c in body["checks"]] == ["pain_points", "stakeholders", "criteria", "links", "dates", "sponsor_agreed"]
    assert body["checks"][5]["problems"] == [{"code": "sponsor_not_agreed", "item_kind": None, "item_id": None}]
    assert client_for(FakeLock()).get("/api/py/pov/nope/readiness").status_code == 404


def test_lock_returns_the_locked_plan():
    r = lock(client_for(FakeLock()), go_threshold=85, no_go_threshold=55)
    body = r.json()
    assert r.status_code == 200 and body["status"] == "locked"
    assert (body["go_threshold"], body["no_go_threshold"], body["baseline_end_date"]) == (85, 55, "2027-02-03")


def test_a_plan_that_is_not_ready_is_422_with_the_checks():
    r = lock(client_for(FakeLock(agreed=False)))
    assert r.status_code == 422 and r.json()["detail"] == "not_ready"
    assert r.json()["readiness"]["passed"] == 5


def test_error_statuses():
    assert lock(client_for(FakeLock(), email="colleague@x")).json() == {"detail": "not_assigned"}
    assert lock(client_for(FakeLock(), email="colleague@x")).status_code == 403
    r = lock(client_for(FakeLock(status="draft")))
    assert (r.status_code, r.json()["code"], r.json()["current"]["status"]) == (409, "invalid_transition", "draft")
    repo = FakeLock()
    repo.edit_before_write = True
    r = lock(client_for(repo))
    assert (r.status_code, r.json()["code"]) == (409, "version_conflict")
    r = lock(client_for(FakeLock()), go_threshold=40)
    assert (r.status_code, r.json()["detail"]) == (422, "invalid_thresholds")
    c = client_for(FakeLock())
    assert c.post(f"{URL}/transitions", json={"to": "decided", "op_id": str(uuid4())}).status_code == 422
    assert c.post("/api/py/pov/nope/transitions", json={"to": "locked", "op_id": str(uuid4())}).status_code == 404


def test_start_collaborating():
    r = client_for(FakeLock(status="draft")).post(f"{URL}/transitions", json={"to": "collaborating", "op_id": str(uuid4())})
    assert r.status_code == 200 and r.json()["status"] == "collaborating"


def test_owner_records_sponsor_agreement_then_locks():
    repo = FakeLock(agreed=False)
    c = client_for(repo)
    r = c.post(f"{URL}/sponsor-agreement", json={"op_id": str(uuid4())})
    assert r.status_code == 200 and (r.json()["passed"], r.json()["allowed_transitions"]) == (6, ["locked"])
    assert lock(c).json()["status"] == "locked"
    r = c.post(f"{URL}/sponsor-agreement", json={"op_id": str(uuid4())})  # too late: already locked
    assert (r.status_code, r.json()["code"]) == (409, "invalid_transition")


def test_sponsor_agreement_errors():
    url = f"{URL}/sponsor-agreement"
    body = {"op_id": str(uuid4())}
    assert client_for(FakeLock(agreed=False), email="colleague@x").post(url, json=body).status_code == 403
    assert client_for(FakeLock(status="draft", agreed=False)).post(url, json=body).status_code == 409
    assert client_for(FakeLock(agreed=False)).post(url, json={}).status_code == 422
    assert client_for(FakeLock()).post("/api/py/pov/nope/sponsor-agreement", json=body).status_code == 404


def test_plan_endpoint_is_404_for_an_unknown_pov():
    assert client_for(FakeLock()).get("/api/py/pov/nope/plan").status_code == 404
