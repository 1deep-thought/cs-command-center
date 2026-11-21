"""Health score + risk drivers — the single source of truth (spec §2, §4).

Pure functions over AccountInputs. No I/O, no frontend logic.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta

from .config import EXEC_CALL_ARR_THRESHOLD_USD, MIN_AVAILABLE_WEIGHT, WEIGHTS
from .inputs import AccountInputs, CallRef, FlaggedCall
from .models import DataGap, HealthBand, HealthComponent, RiskDriver, SourceRef

RISK_MENTION_TRACKERS = {"competitor", "budget_pricing", "renewal_hesitation"}
RISK_MENTION_LABELS = {
    "competitor": "Competitor mentioned on call",
    "budget_pricing": "Pricing pushback on call",
    "renewal_hesitation": "Renewal hesitation on call",
}
HIGH_PRIORITY = {"High", "Urgent"}


def round_half_up(x: float) -> int:
    """Spec rounding (Python's round() is banker's rounding)."""
    return int(math.floor(x + 0.5))


def clamp(x: int, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, x))


@dataclass(frozen=True)
class Windows:
    as_of: date

    @property
    def last_30d(self) -> tuple[date, date]:
        return self.as_of - timedelta(days=29), self.as_of

    @property
    def prior_30d(self) -> tuple[date, date]:
        start, _ = self.last_30d
        return start - timedelta(days=30), start - timedelta(days=1)

    @property
    def wau_week_end(self) -> date:
        """Last complete ISO week (Mon–Sun) ending on or before as_of."""
        return self.as_of - timedelta(days=(self.as_of.weekday() + 1) % 7)


def _fmt_range(r: tuple[date, date]) -> str:
    return f"{r[0].isoformat()}..{r[1].isoformat()}"


def gong_ref(call: CallRef | None) -> SourceRef:
    if call is None:
        return SourceRef(source="Gong", ref_label="[Gong: none]")
    return SourceRef(
        source="Gong",
        ref_label=f"[Gong: {call.call_date.isoformat()}]",
        start_date=call.call_date,
        end_date=call.call_date,
        record_id=call.call_id,
        url=call.url,
    )


@dataclass
class Scored:
    component_scores: dict[HealthComponent, int | None]
    data_gaps: list[DataGap]
    health_score: int | None
    health_band: HealthBand
    band_overridden: bool
    seat_utilization_pct: float | None
    usage_trend_pct: float | None
    days_since_customer_call: int | None
    days_since_exec_call: int | None
    risk_drivers: list[RiskDriver] = field(default_factory=list)


def band_for(score: int | None) -> HealthBand:
    if score is None:
        return "insufficient_data"
    if score >= 70:
        return "healthy"
    if score >= 50:
        return "watch"
    return "at_risk"


def score_account(a: AccountInputs, as_of: date) -> Scored:
    w = Windows(as_of)
    gaps: list[DataGap] = []
    comp: dict[HealthComponent, int | None] = {k: None for k in WEIGHTS}

    def days_since(call: CallRef | None) -> int | None:
        return None if call is None else (as_of - call.call_date).days

    d_call = days_since(a.last_customer_call)
    d_exec = days_since(a.last_exec_call)

    # --- Telemetry availability (§2.4) ---
    telemetry_ok = True
    trend_ok = True
    if not a.telemetry_mapped:
        gaps.append("telemetry_unmapped")
        telemetry_ok = trend_ok = False
    elif a.telemetry_history_days < 30:
        gaps.append("telemetry_lt_30d")
        telemetry_ok = trend_ok = False
    elif a.telemetry_history_days < 60:
        gaps.append("telemetry_lt_60d")
        trend_ok = False

    seats_ok = bool(a.licensed_seats)
    if not seats_ok:
        gaps.append("seat_count_missing")

    # C1 seat utilization
    u: float | None = None
    if telemetry_ok and seats_ok and a.wau is not None and a.licensed_seats:
        u = a.wau / a.licensed_seats
        comp["seat_utilization"] = min(100, round_half_up(100 * u / 0.70))

    # C2 usage trend
    r: float | None = None
    if trend_ok:
        last, prior = a.active_user_days_last_30d, a.active_user_days_prior_30d
        if prior == 0:
            comp["usage_trend"] = 100 if last > 0 else 0
        else:
            r = (last - prior) / prior
            comp["usage_trend"] = clamp(round_half_up(80 + 200 * r))

    # C3 relationship
    relationship_ok = True
    if not a.gong_mapped:
        gaps.append("gong_unmapped")
        relationship_ok = False
    elif a.last_customer_call is None and a.account_age_days <= 90:
        gaps.append("gong_new_account")
        relationship_ok = False
    if relationship_ok:
        if d_call is None or d_call > 90:
            base = 0
        elif d_call <= 30:
            base = 100
        elif d_call <= 60:
            base = 70
        else:
            base = 40
        flagged = {c.call_id for c in a.flagged_calls_90d if c.tracker in RISK_MENTION_TRACKERS}
        comp["relationship"] = max(0, base - min(50, 25 * len(flagged)))

    # C4 key feature adoption
    if telemetry_ok:
        comp["key_feature_adoption"] = round_half_up(100 * len(a.key_features_adopted) / 3)

    # C5 support friction
    if not a.tickets_available:
        gaps.append("tickets_unavailable")
    else:
        s = 100
        for t in a.open_tickets:
            if t.priority in HIGH_PRIORITY:
                s -= 20
            elif (as_of - t.opened_date).days > 14:
                s -= 10
        if a.wisdom_questions_30d >= 5:
            s -= round_half_up(50 * a.wisdom_unresolved_30d / a.wisdom_questions_30d)
        comp["support_friction"] = max(0, s)

    # Composite (§2.3)
    avail = {k: v for k, v in comp.items() if v is not None}
    avail_weight = sum(WEIGHTS[k] for k in avail)
    score: int | None = None
    if avail_weight >= MIN_AVAILABLE_WEIGHT:
        score = round_half_up(sum(WEIGHTS[k] * v for k, v in avail.items()) / avail_weight)
    band = band_for(score)

    churn_calls = sorted(
        (c for c in a.flagged_calls_90d if c.tracker == "churn_intent"),
        key=lambda c: c.call_date,
        reverse=True,
    )
    overridden = False
    if churn_calls and band != "at_risk":
        band, overridden = "at_risk", True

    drivers = _risk_drivers(
        a, w, comp, churn_calls, r=r, u=u, d_call=d_call, d_exec=d_exec, telemetry_ok=telemetry_ok
    )

    return Scored(
        component_scores=comp,
        data_gaps=gaps,
        health_score=score,
        health_band=band,
        band_overridden=overridden,
        seat_utilization_pct=u,
        usage_trend_pct=r,
        days_since_customer_call=d_call,
        days_since_exec_call=d_exec,
        risk_drivers=drivers,
    )


def _risk_drivers(
    a: AccountInputs,
    w: Windows,
    comp: dict[HealthComponent, int | None],
    churn_calls: list[FlaggedCall],
    *,
    r: float | None,
    u: float | None,
    d_call: int | None,
    d_exec: int | None,
    telemetry_ok: bool,
) -> list[RiskDriver]:
    out: list[RiskDriver] = []
    as_of = w.as_of
    relationship_ok = comp["relationship"] is not None

    # 1 CHURN_INTENT
    if churn_calls:
        out.append(
            RiskDriver(
                code="CHURN_INTENT",
                severity=1,
                label="Churn intent raised on call",
                source_refs=[gong_ref(c) for c in churn_calls[:3]],
            )
        )

    # 2 URGENT_TICKETS
    if a.tickets_available:
        urgent = sorted(
            (
                t
                for t in a.open_tickets
                if t.priority in HIGH_PRIORITY and (as_of - t.opened_date).days > 7
            ),
            key=lambda t: t.opened_date,
        )
        if urgent:
            oldest = urgent[0]
            n = len(urgent)
            out.append(
                RiskDriver(
                    code="URGENT_TICKETS",
                    severity=2,
                    label=f"{n} urgent ticket{'s' if n > 1 else ''} open >7d",
                    source_refs=[
                        SourceRef(
                            source="HubSpot",
                            ref_label=f"[HubSpot: ticket #{oldest.ticket_id}, opened {oldest.opened_date.isoformat()}]",
                            start_date=oldest.opened_date,
                            end_date=oldest.opened_date,
                            record_id=oldest.ticket_id,
                        )
                    ],
                )
            )

    # 3 USAGE_DROP (requires the trend component, i.e. ≥60d telemetry)
    if r is not None and r <= -0.20:
        last, prior = w.last_30d, w.prior_30d
        out.append(
            RiskDriver(
                code="USAGE_DROP",
                severity=3,
                label=f"Active users {_signed_pct(r)} vs prior 30d",
                source_refs=[
                    SourceRef(
                        source="Telemetry",
                        ref_label=f"[Telemetry: {_fmt_range(last)} vs {_fmt_range(prior)}]",
                        start_date=prior[0],
                        end_date=last[1],
                    )
                ],
            )
        )

    # 4 NO_CUSTOMER_CALL
    if a.gong_mapped and a.account_age_days > 90 and (d_call is None or d_call > 60):
        label = "No customer call on record" if d_call is None else f"No customer call in {d_call}d"
        out.append(
            RiskDriver(
                code="NO_CUSTOMER_CALL",
                severity=4,
                label=label,
                source_refs=[gong_ref(a.last_customer_call)],
            )
        )

    # 5 RISK_MENTION
    mentions = sorted(
        (c for c in a.flagged_calls_90d if c.tracker in RISK_MENTION_TRACKERS),
        key=lambda c: c.call_date,
        reverse=True,
    )
    if mentions and relationship_ok:
        out.append(
            RiskDriver(
                code="RISK_MENTION",
                severity=5,
                label=RISK_MENTION_LABELS[mentions[0].tracker],
                source_refs=[gong_ref(c) for c in mentions[:3]],
            )
        )

    # 6 LOW_SEAT_UTILIZATION
    if u is not None and u < 0.40:
        out.append(
            RiskDriver(
                code="LOW_SEAT_UTILIZATION",
                severity=6,
                label=f"Seat utilization {round_half_up(u * 100)}% ({a.wau}/{a.licensed_seats})",
                source_refs=[
                    SourceRef(
                        source="Telemetry",
                        ref_label=f"[Telemetry: WAU 4wk to {w.wau_week_end.isoformat()}]",
                        start_date=w.wau_week_end - timedelta(days=27),
                        end_date=w.wau_week_end,
                    ),
                    SourceRef(source="HubSpot", ref_label="[HubSpot: licensed_seats]"),
                ],
            )
        )

    # 7 NO_EXEC_CALL
    if (
        relationship_ok
        and a.arr_usd >= EXEC_CALL_ARR_THRESHOLD_USD
        and (d_exec is None or d_exec > 90)
    ):
        label = "No exec call on record" if d_exec is None else f"No exec call in {d_exec}d"
        out.append(
            RiskDriver(
                code="NO_EXEC_CALL",
                severity=7,
                label=label,
                source_refs=[gong_ref(a.last_exec_call)],
            )
        )

    # 8 UNRESOLVED_QUESTIONS
    q, unresolved = a.wisdom_questions_30d, a.wisdom_unresolved_30d
    if q >= 5 and unresolved / q >= 0.30:
        last = w.last_30d
        out.append(
            RiskDriver(
                code="UNRESOLVED_QUESTIONS",
                severity=8,
                label=f"{round_half_up(100 * unresolved / q)}% of chat questions unresolved ({unresolved}/{q})",
                source_refs=[
                    SourceRef(
                        source="WisdomAI",
                        ref_label=f"[WisdomAI: {_fmt_range(last)}]",
                        start_date=last[0],
                        end_date=last[1],
                    )
                ],
            )
        )

    # 9 KEY_FEATURE_UNADOPTED
    if telemetry_ok and a.key_features_unadopted:
        last = w.last_30d
        out.append(
            RiskDriver(
                code="KEY_FEATURE_UNADOPTED",
                severity=9,
                label="Not adopted: " + ", ".join(a.key_features_unadopted[:2]),
                source_refs=[
                    SourceRef(
                        source="Telemetry",
                        ref_label=f"[Telemetry: {_fmt_range(last)}]",
                        start_date=last[0],
                        end_date=last[1],
                    )
                ],
            )
        )

    return sorted(out, key=lambda d: d.severity)


def _signed_pct(r: float) -> str:
    p = round_half_up(abs(r) * 100)
    return f"{'+' if r >= 0 else '−'}{p}%"
