"""API contract for the Health & Renewals dashboard.

Mirrored in src/types/renewals.ts — change both together (CLAUDE.md: Schema Parity).
Spec: docs/specs/health-renewals.md §6.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Source = Literal["Gong", "Telemetry", "HubSpot", "WisdomAI"]

RiskDriverCode = Literal[
    "CHURN_INTENT",
    "URGENT_TICKETS",
    "USAGE_DROP",
    "NO_CUSTOMER_CALL",
    "RISK_MENTION",
    "LOW_SEAT_UTILIZATION",
    "NO_EXEC_CALL",
    "UNRESOLVED_QUESTIONS",
    "KEY_FEATURE_UNADOPTED",
]

RenewalWindow = Literal["next_90d", "days_91_180"]
HealthBand = Literal["healthy", "watch", "at_risk", "insufficient_data"]
DataGap = Literal[
    "telemetry_lt_30d",
    "telemetry_lt_60d",
    "seat_count_missing",
    "gong_unmapped",
    "gong_new_account",
    "telemetry_unmapped",
    "tickets_unavailable",
    "renewal_date_missing",
]
HealthComponent = Literal[
    "seat_utilization",
    "usage_trend",
    "relationship",
    "key_feature_adoption",
    "support_friction",
]
DataSourceName = Literal["bigquery", "mock"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SourceRef(_Strict):
    source: Source
    ref_label: str
    start_date: date | None = None
    end_date: date | None = None
    record_id: str | None = None
    url: str | None = None


class RiskDriver(_Strict):
    code: RiskDriverCode
    severity: int = Field(ge=1, le=9)
    label: str
    source_refs: list[SourceRef] = Field(min_length=1)


class RenewalsKpiSummary(_Strict):
    as_of_date: date
    window: RenewalWindow
    owner_filter: str | None
    account_count: int
    arr_renewing_usd: float
    arr_renewing_delta_30d_usd: float | None
    arr_at_risk_usd: float
    arr_at_risk_pct: float = Field(ge=0, le=1)
    arr_at_risk_delta_30d_usd: float | None
    forecast_grr_pct: float = Field(ge=0, le=1)
    forecast_retained_arr_usd: float
    forecast_grr_delta_30d_pts: float | None
    unworked_at_risk_arr_usd: float
    unworked_at_risk_arr_delta_30d_usd: float | None
    probability_config_version: str


class AccountRenewalRow(_Strict):
    account_id: str
    account_name: str
    plan: str
    owner_id: str
    owner_name: str
    arr_usd: float
    arr_delta_30d_usd: float | None
    renewal_date: date
    days_to_renewal: int
    is_past_due: bool
    health_score: int | None = Field(ge=0, le=100)
    health_band: HealthBand
    band_overridden: bool
    health_score_delta_30d: int | None
    seat_utilization_pct: float | None
    seat_utilization_delta_30d_pts: float | None
    wau: int | None
    licensed_seats: int | None
    usage_trend_pct: float | None
    days_since_customer_call: int | None
    days_since_exec_call: int | None
    last_customer_call_ref: SourceRef | None
    last_customer_call_is_exec: bool
    risk_drivers: list[RiskDriver]
    data_gaps: list[DataGap]
    component_scores: dict[HealthComponent, int | None]


class Owner(_Strict):
    owner_id: str
    owner_name: str


class RenewalsResponse(_Strict):
    data_source: DataSourceName
    summary: RenewalsKpiSummary
    accounts: list[AccountRenewalRow]
    owners: list[Owner]
