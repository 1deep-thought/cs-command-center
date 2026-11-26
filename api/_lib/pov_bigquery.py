"""BigQuery client for the Proof of Value dataset (cs_pov).

Separate credentials from the read-only warehouse client in bigquery.py: this
service account can write to cs_pov only. Never reuse GOOGLE_APPLICATION_CREDENTIALS_JSON here.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache

from google.cloud import bigquery
from google.oauth2 import service_account

CREDENTIALS_ENV = "POV_GOOGLE_CREDENTIALS_JSON"
DATASET_ENV = "POV_BQ_DATASET"
DEFAULT_DATASET = "cs_pov"
QUERY_TIMEOUT_S = 8.0  # stay under Vercel's 10s budget

_IDENTIFIER = re.compile(r"^[A-Za-z0-9_]+$")
POV_TABLES = frozenset(
    {
        "pov",
        "pain_point",
        "stakeholder",
        "success_criterion",
        "criterion_pain_point",
        "milestone",
        "pov_internal",
        "pov_change_log",
        "pov_revision",
        "pov_access_link",
        "guest_session",
        "pov_viewer_state",
        "vendor_user",
        "pov_member",
        "criterion_vote",
    }
)


@lru_cache(maxsize=1)
def get_pov_client() -> bigquery.Client:
    raw = os.environ.get(CREDENTIALS_ENV)
    if not raw:
        raise RuntimeError(f"{CREDENTIALS_ENV} is not set")
    info = json.loads(raw)
    creds = service_account.Credentials.from_service_account_info(info)
    return bigquery.Client(credentials=creds, project=info["project_id"])


def pov_dataset() -> str:
    name = os.environ.get(DATASET_ENV, DEFAULT_DATASET)
    if not _IDENTIFIER.match(name):
        raise RuntimeError(f"{DATASET_ENV} must be a plain dataset name")
    return name


def pov_table(table: str) -> str:
    """Fully-qualified, backtick-safe table name. Table names come from a fixed set."""
    if table not in POV_TABLES:
        raise ValueError(f"unknown PoV table: {table}")
    client = get_pov_client()
    return f"{client.project}.{pov_dataset()}.{table}"
