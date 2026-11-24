"""Versioned business config owned by CS leadership (spec §2.2 C4, §3.4).

The spec calls for key_features.yaml / renewal_probabilities.yaml; these live
here as typed constants until CS Ops needs to edit them without a deploy.
Bump the version string on every change.
"""

from __future__ import annotations

from typing import Final

from .models import HealthBand, HealthComponent

PROBABILITY_CONFIG_VERSION: Final = "2026-11-20.v1"

RENEWAL_PROBABILITY: Final[dict[HealthBand, float]] = {
    "healthy": 0.95,
    "watch": 0.80,
    "insufficient_data": 0.80,
    "at_risk": 0.50,
}

# Exactly 3 key features per plan; adoption is computed in SQL against this list.
KEY_FEATURES: Final[dict[str, tuple[str, str, str]]] = {
    "Enterprise": ("Workflows", "SSO Provisioning", "Custom Reports"),
    "Growth": ("Workflows", "Integrations", "Dashboards"),
    "Starter": ("Dashboards", "Integrations", "Alerts"),
}

WEIGHTS: Final[dict[HealthComponent, int]] = {
    "seat_utilization": 30,
    "usage_trend": 20,
    "relationship": 20,
    "key_feature_adoption": 15,
    "support_friction": 15,
}

MIN_AVAILABLE_WEIGHT: Final = 60
EXEC_CALL_ARR_THRESHOLD_USD: Final = 100_000


# ---- Proof of Value: what a PoV costs Delphina in team time -----------------------------------
# An estimate from the plan's length, not logged time: weeks from kickoff to decision x standard
# weekly hours per role x one standard hourly value. The hourly figure is a standard value of
# team time (safe to show a prospect), not anyone's salary. Changing a number here re-prices
# every PoV, decided ones included: bump the version string when you do.
POV_INVESTMENT_CONFIG_VERSION: Final = "2026-11-23.v1"
POV_SE_HOURS_PER_WEEK: Final = 10  # Solution Engineer
POV_AE_HOURS_PER_WEEK: Final = 3  # Account Executive
POV_HOURLY_VALUE_MINOR: Final = 150_00  # USD cents per hour, both roles
POV_INVESTMENT_CURRENCY: Final = "USD"
POV_INVESTMENT_MAX_DAYS: Final = 60  # the longest kickoff-to-decision a plan may lock with
