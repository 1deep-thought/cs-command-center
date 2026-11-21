"""Per-account pre-aggregated inputs to the health scorer.

Produced by either the BigQuery query (queries.py) or the mock fixtures
(mock.py). Everything here is already aggregated in SQL — the scorer only
applies the spec's formulas.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

GongTracker = Literal["churn_intent", "competitor", "budget_pricing", "renewal_hesitation"]
TicketPriority = Literal["Low", "Medium", "High", "Urgent"]


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class CallRef(_In):
    call_date: date
    call_id: str
    url: str | None = None


class FlaggedCall(CallRef):
    tracker: GongTracker


class OpenTicket(_In):
    ticket_id: str
    priority: TicketPriority
    opened_date: date


class Snapshot30d(_In):
    """Values from the daily snapshot taken at as_of_date − 30d."""

    health_score: int | None
    health_band: Literal["healthy", "watch", "at_risk", "insufficient_data"]
    arr_usd: float
    seat_utilization_pct: float | None
    days_since_customer_call: int | None


class AccountInputs(_In):
    account_id: str
    account_name: str
    plan: str
    owner_id: str
    owner_name: str
    arr_usd: float
    renewal_date: date | None
    renewal_deal_open: bool
    account_age_days: int

    # Telemetry
    telemetry_mapped: bool
    telemetry_history_days: int = Field(ge=0)
    wau: int | None
    licensed_seats: int | None
    active_user_days_last_30d: int
    active_user_days_prior_30d: int
    key_features_adopted: list[str]
    key_features_unadopted: list[str]

    # Gong (calls restricted to the last 90d except last_* refs)
    gong_mapped: bool
    last_customer_call: CallRef | None
    last_exec_call: CallRef | None
    flagged_calls_90d: list[FlaggedCall]

    # HubSpot tickets + WisdomAI
    tickets_available: bool
    open_tickets: list[OpenTicket]
    wisdom_questions_30d: int
    wisdom_unresolved_30d: int

    snapshot_30d: Snapshot30d | None
