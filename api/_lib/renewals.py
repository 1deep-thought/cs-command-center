"""Assemble the Renewals response: window filter, sort, KPI strip (spec §3)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from .config import PROBABILITY_CONFIG_VERSION, RENEWAL_PROBABILITY
from .inputs import AccountInputs
from .models import (
    AccountRenewalRow,
    DataSourceName,
    HealthBand,
    Owner,
    RenewalsKpiSummary,
    RenewalsResponse,
    RenewalWindow,
)
from .scoring import gong_ref, score_account

BAND_PRIORITY: dict[HealthBand, int] = {
    "at_risk": 0,
    "watch": 1,
    "insufficient_data": 2,
    "healthy": 3,
}


def in_window(
    renewal_date: date, deal_open: bool, as_of: date, window: RenewalWindow
) -> bool:
    if not deal_open:  # Closed Won/Lost leaves the window the day it closes
        return False
    days = (renewal_date - as_of).days
    if window == "next_90d":
        return days <= 90  # includes past-due (days <= 0)
    return 91 <= days <= 180


def _row(a: AccountInputs, as_of: date) -> AccountRenewalRow:
    assert a.renewal_date is not None
    s = score_account(a, as_of)
    snap = a.snapshot_30d
    days = (a.renewal_date - as_of).days

    arr_delta = None
    score_delta = None
    util_delta = None
    if snap is not None:
        arr_delta = (a.arr_usd - snap.arr_usd) or None  # only shown when changed
        if s.health_score is not None and snap.health_score is not None:
            score_delta = s.health_score - snap.health_score
        if s.seat_utilization_pct is not None and snap.seat_utilization_pct is not None:
            util_delta = round((s.seat_utilization_pct - snap.seat_utilization_pct) * 100, 1)

    return AccountRenewalRow(
        account_id=a.account_id,
        account_name=a.account_name,
        plan=a.plan,
        owner_id=a.owner_id,
        owner_name=a.owner_name,
        arr_usd=a.arr_usd,
        arr_delta_30d_usd=arr_delta,
        renewal_date=a.renewal_date,
        days_to_renewal=days,
        is_past_due=days <= 0,
        health_score=s.health_score,
        health_band=s.health_band,
        band_overridden=s.band_overridden,
        health_score_delta_30d=score_delta,
        seat_utilization_pct=s.seat_utilization_pct,
        seat_utilization_delta_30d_pts=util_delta,
        wau=a.wau if s.seat_utilization_pct is not None else None,
        licensed_seats=a.licensed_seats or None,
        usage_trend_pct=s.usage_trend_pct,
        days_since_customer_call=s.days_since_customer_call,
        days_since_exec_call=s.days_since_exec_call,
        last_customer_call_ref=gong_ref(a.last_customer_call) if a.last_customer_call else None,
        last_customer_call_is_exec=(
            a.last_customer_call is not None
            and a.last_exec_call is not None
            and a.last_customer_call.call_id == a.last_exec_call.call_id
        ),
        risk_drivers=s.risk_drivers,
        data_gaps=s.data_gaps,
        component_scores=s.component_scores,
    )


def _sort_key(r: AccountRenewalRow) -> tuple[int, int, date, float]:
    return (0 if r.is_past_due else 1, BAND_PRIORITY[r.health_band], r.renewal_date, -r.arr_usd)


@dataclass(frozen=True)
class _KpiPoint:
    arr_renewing: float
    arr_at_risk: float
    grr: float
    unworked: float


def _kpis(items: list[tuple[float, HealthBand, int | None]]) -> _KpiPoint | None:
    """items: (arr, band, days_since_customer_call)."""
    if not items:
        return None
    total = sum(arr for arr, _, _ in items)
    at_risk = sum(arr for arr, band, _ in items if band == "at_risk")
    retained = sum(arr * RENEWAL_PROBABILITY[band] for arr, band, _ in items)
    unworked = sum(
        arr for arr, band, d in items if band == "at_risk" and (d is None or d > 30)
    )
    return _KpiPoint(total, at_risk, retained / total if total else 0.0, unworked)


def build_renewals(
    accounts: list[AccountInputs],
    *,
    as_of: date,
    window: RenewalWindow,
    owner: str | None,
    data_source: DataSourceName,
) -> RenewalsResponse:
    owners = sorted(
        {Owner(owner_id=a.owner_id, owner_name=a.owner_name) for a in accounts},
        key=lambda o: o.owner_name,
    )
    scoped = [a for a in accounts if owner is None or a.owner_id == owner]

    # Current window. Accounts without a renewal date are excluded (data gap).
    current = [
        a
        for a in scoped
        if a.renewal_date is not None and in_window(a.renewal_date, a.renewal_deal_open, as_of, window)
    ]
    rows = sorted((_row(a, as_of) for a in current), key=_sort_key)

    now = _kpis([(r.arr_usd, r.health_band, r.days_since_customer_call) for r in rows])

    # Same relative window, computed from the snapshot 30 days ago.
    snap_as_of = as_of - timedelta(days=30)
    prior_items = [
        (a.snapshot_30d.arr_usd, a.snapshot_30d.health_band, a.snapshot_30d.days_since_customer_call)
        for a in scoped
        if a.snapshot_30d is not None
        and a.renewal_date is not None
        and in_window(a.renewal_date, True, snap_as_of, window)
    ]
    prior = _kpis(prior_items)

    def delta(cur: float, prev: float | None) -> float | None:
        return None if prev is None else cur - prev

    total = now.arr_renewing if now else 0.0
    at_risk = now.arr_at_risk if now else 0.0
    grr = now.grr if now else 0.0
    unworked = now.unworked if now else 0.0

    summary = RenewalsKpiSummary(
        as_of_date=as_of,
        window=window,
        owner_filter=owner,
        account_count=len(rows),
        arr_renewing_usd=total,
        arr_renewing_delta_30d_usd=delta(total, prior.arr_renewing if prior else None),
        arr_at_risk_usd=at_risk,
        arr_at_risk_pct=at_risk / total if total else 0.0,
        arr_at_risk_delta_30d_usd=delta(at_risk, prior.arr_at_risk if prior else None),
        forecast_grr_pct=grr,
        forecast_retained_arr_usd=grr * total,
        forecast_grr_delta_30d_pts=(
            round((grr - prior.grr) * 100, 1) if prior and now else None
        ),
        unworked_at_risk_arr_usd=unworked,
        unworked_at_risk_arr_delta_30d_usd=delta(unworked, prior.unworked if prior else None),
        probability_config_version=PROBABILITY_CONFIG_VERSION,
    )
    return RenewalsResponse(data_source=data_source, summary=summary, accounts=rows, owners=owners)
