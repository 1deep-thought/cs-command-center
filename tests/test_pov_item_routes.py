"""HTTP contract for child items, with an in-memory repo behind the real app."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from api._lib.auth import require_delphina
from api._lib.auth_core import Principal
from api.index import app
from api.pov_item_routes import get_item_repo
from tests.test_pov_items import FakeItems

BASE = "/api/py/pov/p1"


@pytest.fixture
def client():
    repo = FakeItems()
    # The plan's owner (nobody is assigned yet, so the owner is who may edit it).
    app.dependency_overrides[require_delphina] = lambda: Principal(email="o@x", is_admin=False)
    app.dependency_overrides[get_item_repo] = lambda: repo
    yield TestClient(app), repo
    app.dependency_overrides.clear()


def test_pain_point_lifecycle(client):
    c, _ = client
    r = c.post(f"{BASE}/pain-points", json={"title": "Slow reports"})
    assert r.status_code == 201
    item = r.json()
    assert item["version"] == 1 and item["title"] == "Slow reports"
    url = f"{BASE}/pain-points/{item['pain_point_id']}"
    patched = c.patch(url, json={"base_version": 1, "op_id": str(uuid4()), "title": "Slower"})
    assert patched.status_code == 200 and patched.json()["version"] == 2
    assert len(c.get(f"{BASE}/pain-points").json()) == 1
    gone = c.delete(url, params={"base_version": 2, "op_id": str(uuid4())})
    assert gone.status_code == 204
    assert c.get(f"{BASE}/pain-points").json() == []


def test_stale_patch_is_409_with_current_item(client):
    c, _ = client
    item = c.post(f"{BASE}/stakeholders", json={"name": "Sam"}).json()
    url = f"{BASE}/stakeholders/{item['stakeholder_id']}"
    c.patch(url, json={"base_version": 1, "op_id": str(uuid4()), "name": "Samantha"})
    r = c.patch(url, json={"base_version": 1, "op_id": str(uuid4()), "name": "Sammy"})
    assert r.status_code == 409
    body = r.json()
    assert body["code"] == "version_conflict" and body["current"]["name"] == "Samantha"


def test_limit_is_409_and_frozen_is_409(client):
    c, repo = client
    for i in range(5):
        assert c.post(f"{BASE}/pain-points", json={"title": f"t{i}"}).status_code == 201
    r = c.post(f"{BASE}/pain-points", json={"title": "six"})
    assert r.status_code == 409 and r.json()["code"] == "limit_reached" and r.json()["current"] is None
    repo.pov = repo.pov.model_copy(update={"status": "locked"})
    r = c.post(f"{BASE}/criteria", json={"statement": "Cut query time"})
    assert r.status_code == 409 and r.json()["code"] == "plan_frozen"


def test_validation_and_unknown_pov(client):
    c, _ = client
    assert c.post(f"{BASE}/stakeholders", json={"name": "A", "roles": ["sponsor", "evaluator"]}).status_code == 422
    assert c.post(f"{BASE}/pain-points", json={"title": "x", "extra": 1}).status_code == 422
    assert c.get("/api/py/pov/nope/criteria").status_code == 404
    assert c.post("/api/py/pov/nope/criteria", json={"statement": "s"}).status_code == 404
    assert c.delete(f"{BASE}/criteria/zzz", params={"base_version": 1, "op_id": str(uuid4())}).status_code == 404


def test_invalid_merged_value_range_is_422(client):
    c, _ = client
    item = c.post(f"{BASE}/pain-points", json={"title": "x"}).json()
    r = c.patch(
        f"{BASE}/pain-points/{item['pain_point_id']}",
        json={"base_version": 1, "op_id": str(uuid4()), "value_low_minor": 5},
    )
    assert r.status_code == 422 and r.json()["detail"] == "invalid_value_range"
