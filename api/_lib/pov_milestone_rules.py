"""Milestone rules (design doc: four dates; exercise length 14 to 60 days, default 30)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Final

KIND_ORDER: Final = ("kickoff", "checkpoint", "readout", "decision")
MIN_DAYS, MAX_DAYS, DEFAULT_DAYS = 14, 60, 30
# Suggested offsets from kickoff (the UI offers these; the server never invents dates).
SUGGESTED_OFFSET_DAYS: Final = {"checkpoint": 15, "readout": 28, "decision": 30}


def suggested_dates(kickoff: date) -> dict[str, date]:
    return {kind: kickoff + timedelta(days=d) for kind, d in SUGGESTED_OFFSET_DAYS.items()}


def invalid_milestone_dates(dates_by_kind: dict[str, date | None]) -> str | None:
    """Check the dates as they would be after the change. Kinds not yet set are skipped."""
    present = [(k, dates_by_kind[k]) for k in KIND_ORDER if isinstance(dates_by_kind.get(k), date)]
    for (_, earlier), (_, later) in zip(present, present[1:]):
        if later < earlier:
            return "invalid_milestone_order"  # kickoff <= checkpoint <= readout <= decision
    kickoff, decision = dates_by_kind.get("kickoff"), dates_by_kind.get("decision")
    if isinstance(kickoff, date) and isinstance(decision, date):
        if not MIN_DAYS <= (decision - kickoff).days <= MAX_DAYS:
            return "invalid_exercise_length"
    return None
