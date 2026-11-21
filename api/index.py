"""FastAPI entrypoint (Vercel Python function; routed from /api/py/* by vercel.json).

Local dev:  uv run uvicorn api.index:app --reload --port 8000
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from api._lib.bigquery import data_source
from api._lib.mock import mock_accounts
from api._lib.models import DataSourceName, RenewalsResponse, RenewalWindow
from api._lib.renewals import build_renewals

log = logging.getLogger(__name__)

app = FastAPI(title="CS Command Center API", docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")


def default_as_of() -> date:
    """Last complete UTC day."""
    return datetime.now(timezone.utc).date() - timedelta(days=1)


class Health(BaseModel):
    status: str
    data_source: DataSourceName


@app.get("/api/py/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", data_source=data_source())


@app.get("/api/py/renewals", response_model=RenewalsResponse)
def renewals(
    window: Annotated[RenewalWindow, Query()] = "next_90d",
    owner: Annotated[str | None, Query(max_length=64)] = None,
) -> RenewalsResponse:
    as_of = default_as_of()
    source = data_source()
    if source == "mock":
        accounts = mock_accounts(as_of)
    else:
        # Imported lazily so mock mode never touches the BigQuery client.
        from api._lib.queries import fetch_account_inputs

        try:
            # Owners list needs every owner, so fetch unfiltered and filter in build.
            accounts = fetch_account_inputs(as_of, owner=None)
        except Exception as exc:  # surface a clean 502, keep details in logs
            log.exception("BigQuery renewals query failed")
            raise HTTPException(status_code=502, detail="Warehouse query failed") from exc
    return build_renewals(accounts, as_of=as_of, window=window, owner=owner, data_source=source)
