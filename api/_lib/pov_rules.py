"""The one place PoV business rules live (design doc: "Rules in one place").

Pure functions over plain values so they are testable without BigQuery or FastAPI.
"""

from __future__ import annotations

from datetime import date
from typing import Final

# Plan fields can be edited only until the plan locks.
EDITABLE_STATUSES: Final = frozenset({"draft", "collaborating"})


def plan_is_editable(status: str) -> bool:
    return status in EDITABLE_STATUSES


def invalid_changes(
    *,
    current_start: date | None,
    current_end: date | None,
    current_go: int | None,
    current_no_go: int | None,
    changes: dict[str, object],
) -> str | None:
    """Check the plan as it would be after the patch. Returns an error code or None."""
    start = changes["start_date"] if "start_date" in changes else current_start
    end = changes["end_date"] if "end_date" in changes else current_end
    go = changes["go_threshold"] if "go_threshold" in changes else current_go
    no_go = changes["no_go_threshold"] if "no_go_threshold" in changes else current_no_go

    if isinstance(start, date) and isinstance(end, date) and end < start:
        return "invalid_dates"
    if isinstance(go, int) and isinstance(no_go, int) and go <= no_go:
        return "invalid_thresholds"  # Go must be strictly above No-go
    return None


def invalid_pain_point_change(current: dict[str, object], changes: dict[str, object]) -> str | None:
    """Value range after the patch: both bounds or neither, and high >= low."""
    low = changes["value_low_minor"] if "value_low_minor" in changes else current.get("value_low_minor")
    high = changes["value_high_minor"] if "value_high_minor" in changes else current.get("value_high_minor")
    if (low is None) != (high is None):
        return "invalid_value_range"
    if isinstance(low, int) and isinstance(high, int) and high < low:
        return "invalid_value_range"
    return None
