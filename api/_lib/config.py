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
