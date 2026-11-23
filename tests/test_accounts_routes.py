"""Account book / Account 360 HTTP contract, with an in-memory source behind the real app."""

import pytest
from fastapi.testclient import TestClient

from api._lib import accounts_bq
from api._lib.auth import require_delphina
from api._lib.auth_core import Principal
from api.accounts_routes import get_source
from api.index import app


class FakeSource:
    def __init__(self, fail=False):
        self.fail = fail

    def book(self):
        if self.fail:
            raise RuntimeError("boom")
        return {"accounts": [{"account_id": "acct_1", "account_name": "A", "signals": []}], "freshness": []}

    def account(self, account_id):
        if self.fail:
            raise RuntimeError("boom")
        return {"book": {"account_id": account_id}, "signals": []} if account_id == "acct_1" else None


def client_for(source):
    app.dependency_overrides[require_delphina] = lambda: Principal(email="a@x", is_admin=False)
    if source is not None:
        app.dependency_overrides[get_source] = lambda: source
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_book_and_account():
    c = client_for(FakeSource())
    assert c.get("/api/py/accounts").json()["accounts"][0]["account_id"] == "acct_1"
    assert c.get("/api/py/accounts/acct_1").json()["book"] == {"account_id": "acct_1"}
    assert c.get("/api/py/accounts/acct_2").status_code == 404
    assert c.get("/api/py/accounts/not-an-id").status_code == 422


def test_a_failed_query_is_a_clean_502():
    c = client_for(FakeSource(fail=True))
    assert c.get("/api/py/accounts").status_code == 502
    assert c.get("/api/py/accounts/acct_1").json() == {"detail": "warehouse_query_failed"}


def test_503_when_no_read_only_credentials(monkeypatch):
    for name in (accounts_bq.WIF_AUDIENCE_ENV, accounts_bq.SERVICE_ACCOUNT_ENV, accounts_bq.KEY_ENV):
        monkeypatch.delenv(name, raising=False)
    assert client_for(None).get("/api/py/accounts").status_code == 503


def test_detail_queries_are_all_scoped_to_one_account():
    assert all("@account_id" in sql for sql in accounts_bq.DETAIL_SQL.values())
    assert "SELECT *" not in "".join(accounts_bq.DETAIL_SQL.values()) + accounts_bq.BOOK_SQL
