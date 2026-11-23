"""PoV endpoints for Delphina staff. Every route here sits behind require_delphina."""

from __future__ import annotations

import logging
import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import JSONResponse

from api._lib.auth import require_delphina
from api._lib.auth_core import Principal
from api._lib.pov_bigquery import CREDENTIALS_ENV
from api._lib.pov_models import PovConflict, PovCreate, PovListItem, PovOwnerView, PovPatch
from api._lib.pov_service import PovRepo, create_pov, get_pov, list_povs, patch_pov

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/py/pov", tags=["pov"], dependencies=[Depends(require_delphina)])

Staff = Annotated[Principal, Depends(require_delphina)]
PovId = Annotated[str, Path(min_length=1, max_length=64)]


def get_repo() -> PovRepo:
    """Overridden in tests. Fails closed with 503 when the PoV store is not configured."""
    if not os.environ.get(CREDENTIALS_ENV):
        raise HTTPException(status_code=503, detail="pov_store_not_configured")
    from api._lib.pov_repo import BigQueryPovRepo  # lazy: importing the app never needs BigQuery

    return BigQueryPovRepo()


Repo = Annotated[PovRepo, Depends(get_repo)]


@router.post("", response_model=PovOwnerView, status_code=201)
def create(body: PovCreate, staff: Staff, repo: Repo) -> PovOwnerView:
    return create_pov(repo, body, staff.email)


@router.get("", response_model=list[PovListItem])
def list_all(repo: Repo) -> list[PovListItem]:
    return list_povs(repo)


@router.get("/{pov_id}", response_model=PovOwnerView)
def read(pov_id: PovId, repo: Repo) -> PovOwnerView:
    pov = get_pov(repo, pov_id)
    if pov is None:
        raise HTTPException(status_code=404, detail="pov_not_found")
    return pov


@router.patch(
    "/{pov_id}",
    response_model=PovOwnerView,
    responses={409: {"model": PovConflict}},
)
def update(pov_id: PovId, body: PovPatch, staff: Staff, repo: Repo):
    result = patch_pov(repo, pov_id, body, staff.email)
    if result.kind == "not_found":
        raise HTTPException(status_code=404, detail="pov_not_found")
    if result.kind == "invalid":
        raise HTTPException(status_code=422, detail=result.code)
    assert result.pov is not None
    if result.kind in ("conflict", "frozen"):
        conflict = PovConflict(
            code="plan_frozen" if result.kind == "frozen" else "version_conflict",
            message="The plan is locked." if result.kind == "frozen" else "Someone else changed this first.",
            current=result.pov,
            changed_by=result.pov.updated_by,
            changed_at=result.pov.updated_at,
        )
        return JSONResponse(status_code=409, content=conflict.model_dump(mode="json"))
    return result.pov
