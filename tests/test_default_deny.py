"""Default-deny: every route must reject anonymous requests unless allowlisted.

Behavioral on purpose: it reads the route list from the OpenAPI schema (which lists
every route however it was registered) and calls each one with no credentials.
"""

import re

import pytest
from fastapi.testclient import TestClient

from api.index import PUBLIC_PATHS, app

HTTP_METHODS = {"get", "post", "put", "patch", "delete"}


def _operations() -> list[tuple[str, str]]:
    schema = app.openapi()
    return [
        (method.upper(), path)
        for path, item in schema["paths"].items()
        for method in item
        if method in HTTP_METHODS
    ]


@pytest.fixture
def anonymous(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "client-123")
    for name in ("AUTH_DEV_EMAIL", "VERCEL", "VERCEL_ENV"):
        monkeypatch.delenv(name, raising=False)
    return TestClient(app, raise_server_exceptions=False)


def test_schema_lists_routes():
    # Guards against this suite passing because it found nothing to check.
    paths = {p for _, p in _operations()}
    assert "/api/py/renewals" in paths
    assert "/api/py/health" in paths


def test_public_allowlist_has_no_stale_entries():
    assert PUBLIC_PATHS <= {p for _, p in _operations()}


def test_every_non_public_route_rejects_anonymous_requests(anonymous):
    failures = []
    for method, path in _operations():
        if path in PUBLIC_PATHS:
            continue
        url = re.sub(r"\{[^}]+\}", "x", path)
        status = anonymous.request(method, url).status_code
        if status != 401:
            failures.append(f"{method} {path} -> {status}")
    assert failures == []


def test_public_routes_stay_public(anonymous):
    for method, path in _operations():
        if path in PUBLIC_PATHS:
            assert anonymous.request(method, path).status_code == 200


def test_renewals_challenges_with_bearer(anonymous):
    r = anonymous.get("/api/py/renewals")
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"


def test_a_bad_token_is_401_not_500(anonymous, monkeypatch):
    def reject(token, client_id):
        raise ValueError("Wrong number of segments in token")

    # Avoid a real call to Google's certificate endpoint during tests.
    monkeypatch.setattr("api._lib.auth._verify_google_token", reject)
    r = anonymous.get("/api/py/renewals", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401
