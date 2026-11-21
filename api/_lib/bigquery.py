"""BigQuery client factory.

Credentials come only from GOOGLE_APPLICATION_CREDENTIALS_JSON (the raw service
account JSON, as stored in a Vercel env var). When it is unset the API runs in
mock mode and serves deterministic fixture data instead.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Literal

from google.cloud import bigquery
from google.oauth2 import service_account

CREDENTIALS_ENV = "GOOGLE_APPLICATION_CREDENTIALS_JSON"
DATASET_ENV = "BQ_DATASET"  # e.g. "my-project.cs_warehouse"
DEFAULT_DATASET = "cs_warehouse"
QUERY_TIMEOUT_S = 8.0  # stay under Vercel's 10s budget

DataSource = Literal["bigquery", "mock"]


def data_source() -> DataSource:
    return "bigquery" if os.environ.get(CREDENTIALS_ENV) else "mock"


@lru_cache(maxsize=1)
def get_client() -> bigquery.Client:
    raw = os.environ.get(CREDENTIALS_ENV)
    if not raw:
        raise RuntimeError(f"{CREDENTIALS_ENV} is not set; use mock mode")
    info = json.loads(raw)
    creds = service_account.Credentials.from_service_account_info(info)
    return bigquery.Client(credentials=creds, project=info["project_id"])


def dataset() -> str:
    return os.environ.get(DATASET_ENV, DEFAULT_DATASET)
