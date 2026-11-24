"""PoV HTTP contract, with an in-memory repo behind the real FastAPI app."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from api._lib.auth import require_delphina
from api._lib.auth_core import Principal
from api.index import app
from api.pov_routes import get_repo
from tests.test_pov_service import FakeRepo


@pytest.fixture
def client():
    repo = FakeRepo()
    app.dependency_overrides[require_delphina] = lambda: Principal(email="a@delphina.example", is_admin=False)
    app.dependency_overrides[get_repo] = lambda: repo
    yield TestClient(app), repo
    app.dependency_overrides.clear()


def create(c, **over):
    body = {"title": "Acme PoV", "prospect_name": "Acme", **over}
    return c.post("/api/py/pov", json=body)


def test_create_then_read(client):
    c, _ = client
    r = create(c, prospect_domain="Acme.com")
    assert r.status_code == 201
    pov = r.json()
    assert pov["status"] == "draft" and pov["version"] == 1
    assert pov["prospect_domain"] == "acme.com" and pov["owner_email"] == "a@delphina.example"
    assert c.get(f"/api/py/pov/{pov['pov_id']}").json()["title"] == "Acme PoV"


def test_unknown_pov_is_404(client):
    c, _ = client
    assert c.get("/api/py/pov/nope").status_code == 404
    patch = {"base_version": 1, "op_id": str(uuid4()), "title": "x"}
    assert c.patch("/api/py/pov/nope", json=patch).status_code == 404


def test_patch_applies_and_bumps_version(client):
    c, _ = client
    pov = create(c).json()
    r = c.patch(f"/api/py/pov/{pov['pov_id']}", json={"base_version": 1, "op_id": str(uuid4()), "title": "New"})
    assert r.status_code == 200
    assert r.json()["title"] == "New" and r.json()["version"] == 2


def test_stale_patch_returns_409_with_current_value(client):
    c, _ = client
    pov = create(c).json()
    url = f"/api/py/pov/{pov['pov_id']}"
    c.patch(url, json={"base_version": 1, "op_id": str(uuid4()), "title": "First"})
    r = c.patch(url, json={"base_version": 1, "op_id": str(uuid4()), "title": "Second"})
    assert r.status_code == 409
    body = r.json()
    assert body["code"] == "version_conflict"
    assert body["current"]["title"] == "First" and body["changed_by"] == "a@delphina.example"


def test_locked_plan_returns_409_plan_frozen(client):
    c, repo = client
    pov = create(c).json()
    repo.rows[pov["pov_id"]] = repo.rows[pov["pov_id"]].model_copy(update={"status": "locked"})
    r = c.patch(f"/api/py/pov/{pov['pov_id']}", json={"base_version": 1, "op_id": str(uuid4()), "title": "x"})
    assert (r.status_code, r.json()["code"]) == (409, "plan_frozen")


def test_invalid_input_is_422(client):
    c, _ = client
    assert create(c, title="").status_code == 422
    assert create(c, currency="usd").status_code == 422
    assert create(c, status="locked").status_code == 422  # unknown field
    pov = create(c).json()
    url = f"/api/py/pov/{pov['pov_id']}"
    bad = {"base_version": 1, "op_id": str(uuid4()), "go_threshold": 50, "no_go_threshold": 70}
    r = c.patch(url, json=bad)
    assert (r.status_code, r.json()["detail"]) == (422, "invalid_thresholds")
    assert c.patch(url, json={"base_version": 1, "op_id": str(uuid4())}).status_code == 422  # empty patch


def test_store_not_configured_is_503(monkeypatch):
    monkeypatch.delenv("POV_GOOGLE_CREDENTIALS_JSON", raising=False)
    app.dependency_overrides[require_delphina] = lambda: Principal(email="a@delphina.example", is_admin=False)
    try:
        assert TestClient(app).get("/api/py/pov").status_code == 503
    finally:
        app.dependency_overrides.clear()


def test_handover_needs_owner_and_a_person_with_access(client):
    from api.pov_routes import get_staff_check

    c, _ = client
    app.dependency_overrides[get_staff_check] = lambda: (lambda email: email == "b@delphina.example")
    pov = create(c).json()
    url = f"/api/py/pov/{pov['pov_id']}"
    r = c.patch(url, json={"base_version": 1, "op_id": str(uuid4()), "owner_email": "nobody@example.com"})
    assert r.status_code == 422 and r.json()["detail"] == "owner_not_staff"
    r = c.patch(url, json={"base_version": 1, "op_id": str(uuid4()), "owner_email": "B@delphina.example"})
    assert r.status_code == 200 and r.json()["owner_email"] == "b@delphina.example"
    # No longer the owner, and not an admin: cannot take it back.
    r = c.patch(url, json={"base_version": 2, "op_id": str(uuid4()), "owner_email": "a@delphina.example"})
    assert r.status_code == 403 and r.json()["detail"] == "owner_only"


def test_admin_hands_over_and_account_links_on_a_locked_plan(client):
    from api.pov_routes import get_staff_check

    c, repo = client
    app.dependency_overrides[get_staff_check] = lambda: (lambda email: True)
    pov = create(c).json()
    url = f"/api/py/pov/{pov['pov_id']}"
    repo.rows[pov["pov_id"]] = repo.rows[pov["pov_id"]].model_copy(update={"status": "locked", "owner_email": "z@delphina.example"})
    r = c.patch(url, json={"base_version": 1, "op_id": str(uuid4()), "account_id": "acct_42"})
    assert r.status_code == 200 and r.json()["account_id"] == "acct_42" and r.json()["seq"] == pov["seq"]
    assert c.patch(url, json={"base_version": 2, "op_id": str(uuid4()), "title": "x"}).status_code == 409
    app.dependency_overrides[require_delphina] = lambda: Principal(email="boss@delphina.example", is_admin=True)
    r = c.patch(url, json={"base_version": 2, "op_id": str(uuid4()), "owner_email": "b@delphina.example"})
    assert r.status_code == 200 and r.json()["owner_email"] == "b@delphina.example"
