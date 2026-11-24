"""Delphina's estimated investment in a PoV: weeks x weekly hours per role x a standard hourly value."""

from datetime import date

import pytest

from api._lib.config import POV_AE_HOURS_PER_WEEK, POV_HOURLY_VALUE_MINOR, POV_SE_HOURS_PER_WEEK
from api._lib.pov_items import PlanView
from api._lib.pov_models import Investment
from api._lib.pov_lock_service import get_plan
from api._lib.pov_rules import investment
from tests.test_pov_lock import OWNER, FakeLock, ready_parts

D = date.fromisoformat


def test_the_agreed_numbers():
    # Confirmed by the owner on 2026-11-23. Change them in config.py (and bump the version there).
    assert (POV_SE_HOURS_PER_WEEK, POV_AE_HOURS_PER_WEEK, POV_HOURLY_VALUE_MINOR) == (10, 3, 150_00)


def test_four_weeks_is_52_hours_and_7800_dollars():
    assert investment(D("2027-01-04"), D("2027-02-01")) == {
        "days": 28, "se_hours": 40, "ae_hours": 12, "total_minor": 780_000, "currency": "USD",
    }


@pytest.mark.parametrize(
    ("days", "se", "ae"),
    [(14, 20, 6), (30, 43, 13), (45, 64, 19), (60, 86, 26), (1, 1, 0), (8, 11, 3)],
)
def test_hours_follow_the_length_rounded_half_up(days, se, ae):
    start = D("2027-01-04")
    got = investment(start, date.fromordinal(start.toordinal() + days))
    assert (got["se_hours"], got["ae_hours"]) == (se, ae)
    assert got["total_minor"] == (se + ae) * 15000


def test_milestones_win_over_the_plan_dates_which_are_the_fallback():
    assert investment(D("2027-01-04"), D("2027-01-18"), D("2027-01-01"), D("2027-03-01"))["days"] == 14
    assert "hourly_value_minor" not in investment(D("2027-01-04"), D("2027-01-18"))  # the rate is never sent
    assert investment(None, None, D("2027-01-04"), D("2027-02-01"))["days"] == 28
    # Placeholder dates a year apart are not a PoV length: no figure, not a six-figure one.
    assert investment(None, None, D("2027-01-04"), D("2028-01-04")) is None
    assert investment(D("2027-01-04"), D("2027-03-05"))["days"] == 60
    assert investment(D("2027-01-04"), D("2027-03-06")) is None
    # Half a pair of milestones is not a length: fall back, never mix the two sources.
    assert investment(D("2027-01-04"), None, D("2027-01-01"), D("2027-01-15"))["days"] == 14


def test_no_estimate_without_usable_dates():
    assert investment(None, None) is None
    assert investment(D("2027-01-04"), None) is None
    assert investment(D("2027-01-04"), D("2027-01-04")) is None
    assert investment(D("2027-02-01"), D("2027-01-04")) is None


def test_the_plan_carries_the_estimate_next_to_the_pov_not_inside_it():
    plan = get_plan(FakeLock("collaborating", parts=ready_parts()), "p1", OWNER)
    assert plan["investment"]["days"] == 30 and plan["investment"]["total_minor"] == (43 + 13) * 15000
    assert "investment" not in plan["pov"].model_dump()  # so it never enters the lock snapshot
    assert PlanView.model_fields["investment"].annotation == Investment | None


def test_a_plan_without_dates_has_no_estimate():
    parts = ready_parts()
    parts["milestones"] = []
    assert get_plan(FakeLock("draft", parts=parts), "p1", OWNER)["investment"] is None


def test_list_rows_get_the_same_figure():
    pytest.importorskip("google.cloud.bigquery")
    from datetime import datetime, timezone

    from api._lib.pov_repo import list_item

    row = {
        "pov_id": "p1", "title": "t", "prospect_name": "a", "status": "locked", "decision": None, "currency": "EUR",
        "end_date": None, "owner_email": "o@x", "version": 3, "updated_at": datetime(2026, 11, 23, tzinfo=timezone.utc),
        "account_id": None, "start_date": None, "decision_date": D("2027-02-01"), "kickoff_date": D("2027-01-04"),
    }
    item = list_item(dict(row))
    assert item.invest_minor == 780_000 and item.decision_date == D("2027-02-01")
    assert list_item({**row, "kickoff_date": None}).invest_minor is None
