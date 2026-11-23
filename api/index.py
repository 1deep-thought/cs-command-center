"""FastAPI entrypoint (Vercel Python function; routed from /api/py/* by vercel.json).

Local dev:  uv run uvicorn api.index:app --reload --port 8000

Auth is default-deny: every route sits on `guarded` (Delphina staff only) unless it
is listed in PUBLIC_PATHS. tests/test_default_deny.py fails if a route is neither.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel

from api._lib.auth import require_delphina
from api._lib.bigquery import data_source
from api._lib.mock import mock_accounts
from api._lib.models import DataSourceName, RenewalsResponse, RenewalWindow
from api._lib.renewals import build_renewals
from api.pov_item_routes import router as pov_item_router
from api.pov_lock_routes import router as pov_lock_router
from api.pov_routes import router as pov_router

log = logging.getLogger(__name__)

# Interactive docs and the OpenAPI schema describe every route, so they are only
# served off Vercel (local dev). On Vercel they are off, not merely unlinked.
_ON_VERCEL = bool(os.environ.get("VERCEL") or os.environ.get("VERCEL_ENV"))

app = FastAPI(
    title="CS Command Center API",
    docs_url=None if _ON_VERCEL else "/api/py/docs",
    openapi_url=None if _ON_VERCEL else "/api/py/openapi.json",
)

# Anything not listed here must require a signed-in Delphina user.
PUBLIC_PATHS: frozenset[str] = frozenset({"/api/py/health"})

public = APIRouter()
guarded = APIRouter(dependencies=[Depends(require_delphina)])


def default_as_of() -> date:
    """Last complete UTC day."""
    return datetime.now(timezone.utc).date() - timedelta(days=1)


class Health(BaseModel):
    status: str
    data_source: DataSourceName


@public.get("/api/py/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", data_source=data_source())


@guarded.get("/api/py/renewals", response_model=RenewalsResponse)
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


app.include_router(public)
app.include_router(guarded)
app.include_router(pov_router)  # carries its own require_delphina dependency
app.include_router(pov_item_router)  # same
app.include_router(pov_lock_router)  # same
