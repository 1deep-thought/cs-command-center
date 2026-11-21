"""Deterministic fixtures used when GOOGLE_APPLICATION_CREDENTIALS_JSON is unset.

Dates are relative to as_of so the dashboard never looks stale. The set
deliberately covers every §2.4 edge case (new account, unmapped Gong, missing
seats, churn override, past-due, ticket sync outage).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from .config import KEY_FEATURES
from .inputs import AccountInputs, CallRef, FlaggedCall, OpenTicket, Snapshot30d

OWNERS = {
    "own_ana": "Ana Ruiz",
    "own_dev": "Dev Patel",
    "own_kim": "Kim Osei",
}


def mock_accounts(as_of: date) -> list[AccountInputs]:
    def d(days_ago: int) -> date:
        return as_of - timedelta(days=days_ago)

    def call(days_ago: int, cid: str) -> CallRef:
        return CallRef(call_date=d(days_ago), call_id=cid, url=f"https://app.gong.io/call?id={cid}")

    def flag(days_ago: int, cid: str, tracker: str) -> FlaggedCall:
        return FlaggedCall.model_validate(
            {**call(days_ago, cid).model_dump(), "tracker": tracker}
        )

    def acct(
        idx: int,
        name: str,
        plan: str,
        owner: str,
        arr: float,
        renew_in: int | None,
        *,
        adopted: int = 3,
        snap: dict[str, Any] | None = None,
        **kw: Any,
    ) -> AccountInputs:
        features = KEY_FEATURES[plan]
        base: dict[str, Any] = dict(
            account_id=f"acc_{idx:03d}",
            account_name=name,
            plan=plan,
            owner_id=owner,
            owner_name=OWNERS[owner],
            arr_usd=arr,
            renewal_date=None if renew_in is None else as_of + timedelta(days=renew_in),
            renewal_deal_open=True,
            account_age_days=720,
            telemetry_mapped=True,
            telemetry_history_days=365,
            wau=80,
            licensed_seats=100,
            active_user_days_last_30d=1800,
            active_user_days_prior_30d=1750,
            key_features_adopted=list(features[:adopted]),
            key_features_unadopted=list(features[adopted:]),
            gong_mapped=True,
            last_customer_call=call(12, f"g{idx}a"),
            last_exec_call=call(40, f"g{idx}e"),
            flagged_calls_90d=[],
            tickets_available=True,
            open_tickets=[],
            wisdom_questions_30d=8,
            wisdom_unresolved_30d=1,
            snapshot_30d=Snapshot30d(
                health_score=snap.get("score", 85) if snap else 85,
                health_band=snap.get("band", "healthy") if snap else "healthy",
                arr_usd=snap.get("arr", arr) if snap else arr,
                seat_utilization_pct=snap.get("util", 0.78) if snap else 0.78,
                days_since_customer_call=snap.get("call", 10) if snap else 10,
            ),
        )
        base.update(kw)
        return AccountInputs.model_validate(base)

    return [
        # Churn intent override: decent score, forced At Risk.
        acct(1, "Northwind Logistics", "Enterprise", "own_ana", 412_000, 34,
             wau=96, licensed_seats=150, active_user_days_last_30d=2100, active_user_days_prior_30d=2400,
             flagged_calls_90d=[flag(9, "g1c", "churn_intent"), flag(9, "g1c", "budget_pricing")],
             last_customer_call=call(9, "g1c"),
             snap={"score": 74, "util": 0.70}),
        # Classic decay: usage drop, no recent call, low seats.
        acct(2, "Halcyon Health", "Enterprise", "own_dev", 268_000, 22, adopted=1,
             wau=42, licensed_seats=150, active_user_days_last_30d=820, active_user_days_prior_30d=1210,
             last_customer_call=call(74, "g2a"), last_exec_call=call(131, "g2e"),
             open_tickets=[OpenTicket(ticket_id="48213", priority="Urgent", opened_date=d(17)),
                           OpenTicket(ticket_id="48390", priority="High", opened_date=d(9))],
             wisdom_questions_30d=22, wisdom_unresolved_30d=9,
             snap={"score": 46, "band": "at_risk", "util": 0.39, "call": 44}),
        # Past due, Watch.
        acct(3, "Ferro Analytics", "Growth", "own_kim", 86_000, -6, adopted=2,
             wau=40, licensed_seats=90, active_user_days_last_30d=1000, active_user_days_prior_30d=1150,
             last_customer_call=call(38, "g3a"), flagged_calls_90d=[flag(38, "g3a", "competitor")],
             snap={"score": 68, "band": "watch", "util": 0.64, "call": 8}),
        # New account (<30d telemetry) → Insufficient data.
        acct(4, "Quill & Co", "Starter", "own_ana", 18_000, 61, account_age_days=26,
             telemetry_history_days=21, last_customer_call=None, last_exec_call=None,
             wisdom_questions_30d=2, wisdom_unresolved_30d=0, snapshot_30d=None),
        # Seat count missing → C1 excluded, scored on 70 weight.
        acct(5, "Brightline Media", "Growth", "own_dev", 64_000, 47, licensed_seats=None,
             snap={"score": 80, "util": None}),
        # Gong unmapped → C3 excluded.
        acct(6, "Aster Robotics", "Enterprise", "own_kim", 190_000, 72, gong_mapped=False,
             last_customer_call=None, last_exec_call=None, wau=118, licensed_seats=140,
             snap={"score": 88, "util": 0.82}),
        # Healthy, upsold.
        acct(7, "Lumen Payments", "Enterprise", "own_ana", 355_000, 58, wau=212, licensed_seats=250,
             active_user_days_last_30d=5200, active_user_days_prior_30d=4700,
             last_customer_call=call(6, "g7a"), last_exec_call=call(6, "g7a"),
             snap={"arr": 310_000, "score": 89, "util": 0.81}),
        # Healthy but no exec call (≥$100k).
        acct(8, "Corvid Security", "Enterprise", "own_dev", 148_000, 15, wau=62, licensed_seats=80,
             last_exec_call=call(120, "g8e"), snap={"score": 87, "util": 0.80}),
        # Telemetry 30–59d → trend excluded.
        acct(9, "Pebble Learning", "Growth", "own_kim", 42_000, 83, account_age_days=50,
             telemetry_history_days=50, wau=31, licensed_seats=60, adopted=2,
             last_customer_call=call(20, "g9a"), last_exec_call=None, snapshot_30d=None),
        # Ticket sync outage + pricing pushback.
        acct(10, "Tessellate Inc", "Growth", "own_ana", 97_000, 40, tickets_available=False,
             flagged_calls_90d=[flag(25, "g10a", "budget_pricing"), flag(52, "g10b", "renewal_hesitation")],
             last_customer_call=call(25, "g10a"),
             snap={"score": 79, "util": 0.78}),
        # Downsell + at-risk, unworked (no call 30d+).
        acct(11, "Meridian Freight", "Growth", "own_dev", 73_000, 29, adopted=1,
             wau=19, licensed_seats=80, active_user_days_last_30d=410, active_user_days_prior_30d=640,
             last_customer_call=call(95, "g11a"), last_exec_call=None,
             snap={"arr": 93_000, "score": 51, "band": "watch", "util": 0.30, "call": 65}),
        # Starter healthy.
        acct(12, "Saltbox Studio", "Starter", "own_kim", 12_000, 9, wau=11, licensed_seats=12,
             last_exec_call=None, wisdom_questions_30d=3, snap={"score": 92, "util": 0.92}),
        # 91–180 window accounts.
        acct(13, "Orbital Foods", "Enterprise", "own_ana", 520_000, 128, adopted=2,
             wau=180, licensed_seats=400, active_user_days_last_30d=3600, active_user_days_prior_30d=4900,
             last_customer_call=call(48, "g13a"), last_exec_call=call(160, "g13e"),
             snap={"score": 66, "band": "watch", "util": 0.50}),
        acct(14, "Verity Legal", "Growth", "own_dev", 58_000, 150, snap={"score": 84}),
        acct(15, "Kestrel Energy", "Enterprise", "own_kim", 233_000, 104,
             flagged_calls_90d=[flag(15, "g15a", "competitor")], last_customer_call=call(15, "g15a"),
             open_tickets=[OpenTicket(ticket_id="47751", priority="Medium", opened_date=d(30))],
             snap={"score": 83}),
        # Closed renewal (should never appear) and missing renewal date.
        acct(16, "Driftwood Labs", "Starter", "own_ana", 9_000, 5, renewal_deal_open=False),
        acct(17, "Nimbus Retail", "Growth", "own_dev", 51_000, None),
    ]
