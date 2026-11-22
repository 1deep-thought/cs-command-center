from datetime import date

import pytest
from fastapi.testclient import TestClient

from api._lib.mock import mock_accounts
from api._lib.renewals import build_renewals
from api._lib.scoring import round_half_up, score_account
from api.index import app

AS_OF = date(2026, 11, 19)


@pytest.fixture
def accounts():
    return {a.account_name: a for a in mock_accounts(AS_OF)}


def test_round_half_up():
    assert round_half_up(2.5) == 3
    assert round_half_up(66.5) == 67


def test_new_account_is_insufficient_data(accounts):
    s = score_account(accounts["Quill & Co"], AS_OF)
    assert s.health_score is None
    assert s.health_band == "insufficient_data"
    assert {"telemetry_lt_30d", "gong_new_account"} <= set(s.data_gaps)
    assert s.component_scores["seat_utilization"] is None


def test_churn_intent_overrides_band(accounts):
    s = score_account(accounts["Northwind Logistics"], AS_OF)
    assert s.health_band == "at_risk"
    assert s.band_overridden
    assert s.health_score is not None and s.health_score >= 50
    assert s.risk_drivers[0].code == "CHURN_INTENT"
    assert s.risk_drivers[0].source_refs[0].ref_label.startswith("[Gong: 2026-11-10]")


def test_missing_seats_rescales_not_zero(accounts):
    s = score_account(accounts["Brightline Media"], AS_OF)
    assert s.component_scores["seat_utilization"] is None
    assert "seat_count_missing" in s.data_gaps
    assert s.health_score is not None and s.health_score >= 70


def test_gong_unmapped_excludes_relationship_and_drivers(accounts):
    s = score_account(accounts["Aster Robotics"], AS_OF)
    assert s.component_scores["relationship"] is None
    assert "gong_unmapped" in s.data_gaps
    codes = {d.code for d in s.risk_drivers}
    assert not codes & {"NO_CUSTOMER_CALL", "NO_EXEC_CALL", "RISK_MENTION"}


def test_usage_trend_formula(accounts):
    s = score_account(accounts["Halcyon Health"], AS_OF)
    r = (820 - 1210) / 1210
    assert s.usage_trend_pct == pytest.approx(r)
    assert s.component_scores["usage_trend"] == round_half_up(80 + 200 * r)
    drop = next(d for d in s.risk_drivers if d.code == "USAGE_DROP")
    assert drop.label == "Active users −32% vs prior 30d"
    assert drop.source_refs[0].ref_label == (
        "[Telemetry: 2026-10-21..2026-11-19 vs 2026-09-21..2026-10-20]"
    )


def test_drivers_sorted_and_always_cited(accounts):
    for a in accounts.values():
        s = score_account(a, AS_OF)
        sev = [d.severity for d in s.risk_drivers]
        assert sev == sorted(sev)
        assert all(d.source_refs for d in s.risk_drivers)


def test_window_and_sort(accounts):
    res = build_renewals(
        list(accounts.values()), as_of=AS_OF, window="next_90d", owner=None, data_source="mock"
    )
    names = [r.account_name for r in res.accounts]
    assert names[0] == "Ferro Analytics"  # past due pinned first
    assert "Driftwood Labs" not in names  # closed deal
    assert "Nimbus Retail" not in names  # no renewal date
    assert "Orbital Foods" not in names  # 91–180
    bands = [r.health_band for r in res.accounts if not r.is_past_due]
    order = {"at_risk": 0, "watch": 1, "insufficient_data": 2, "healthy": 3}
    assert [order[b] for b in bands] == sorted(order[b] for b in bands)


def test_kpis(accounts):
    res = build_renewals(
        list(accounts.values()), as_of=AS_OF, window="next_90d", owner=None, data_source="mock"
    )
    k = res.summary
    assert k.arr_renewing_usd == sum(r.arr_usd for r in res.accounts)
    assert k.arr_at_risk_usd == sum(r.arr_usd for r in res.accounts if r.health_band == "at_risk")
    assert 0 < k.forecast_grr_pct < 1
    assert k.unworked_at_risk_arr_usd <= k.arr_at_risk_usd
    assert k.arr_renewing_delta_30d_usd is not None


def test_owner_filter(accounts):
    res = build_renewals(
        list(accounts.values()), as_of=AS_OF, window="next_90d", owner="own_ana", data_source="mock"
    )
    assert {r.owner_id for r in res.accounts} == {"own_ana"}
    assert len(res.owners) == 3


def test_endpoint_mock_mode(monkeypatch, authed_app):
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", raising=False)
    client = TestClient(authed_app)
    assert client.get("/api/py/health").json() == {"status": "ok", "data_source": "mock"}
    body = client.get("/api/py/renewals", params={"window": "days_91_180"}).json()
    assert body["data_source"] == "mock"
    assert body["summary"]["window"] == "days_91_180"
    assert {a["account_name"] for a in body["accounts"]} == {
        "Orbital Foods",
        "Verity Legal",
        "Kestrel Energy",
    }
    assert client.get("/api/py/renewals", params={"window": "bogus"}).status_code == 422
