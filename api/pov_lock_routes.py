"""Readiness (the six lock checks) and status moves for Delphina staff."""

from __future__ import annotations

import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import JSONResponse

from api._lib.auth import require_delphina
from api._lib.auth_core import Principal
from api._lib.pov_bigquery import CREDENTIALS_ENV
from api._lib.pov_lock_service import LockRepo, get_readiness, transition
from api._lib.pov_models import NotReady, PovOwnerView, Readiness, TransitionConflict, TransitionIn

router = APIRouter(prefix="/api/py/pov", tags=["pov-lock"], dependencies=[Depends(require_delphina)])

Staff = Annotated[Principal, Depends(require_delphina)]
PovId = Annotated[str, Path(min_length=1, max_length=64)]

CONFLICT_TEXT = {
    "invalid_transition": "The plan is not in a status this move starts from.",
    "version_conflict": "The plan changed while it was being locked. Check readiness and try again.",
}


def get_lock_repo() -> LockRepo:
    """Overridden in tests. Fails closed with 503 when the PoV store is not configured."""
    if not os.environ.get(CREDENTIALS_ENV):
        raise HTTPException(status_code=503, detail="pov_store_not_configured")
    from api._lib.pov_lock_repo import BigQueryLockRepo  # lazy: importing the app never needs BigQuery

    return BigQueryLockRepo()


Repo = Annotated[LockRepo, Depends(get_lock_repo)]


@router.get("/{pov_id}/readiness", response_model=Readiness)
def read_readiness(pov_id: PovId, staff: Staff, repo: Repo) -> Readiness:
    state = get_readiness(repo, pov_id, staff.email)
    if state is None:
        raise HTTPException(status_code=404, detail="pov_not_found")
    return state


@router.post(
    "/{pov_id}/transitions",
    response_model=PovOwnerView,
    responses={409: {"model": TransitionConflict}, 422: {"model": NotReady}},
)
def move(pov_id: PovId, body: TransitionIn, staff: Staff, repo: Repo):
    result = transition(repo, pov_id, body, staff.email)
    if result.kind == "not_found":
        raise HTTPException(status_code=404, detail="pov_not_found")
    if result.kind == "forbidden":
        raise HTTPException(status_code=403, detail="not_owner")
    if result.kind == "invalid":
        raise HTTPException(status_code=422, detail=result.code)
    if result.kind == "not_ready":
        assert result.readiness is not None
        body_out = NotReady(detail="not_ready", readiness=result.readiness)
        return JSONResponse(status_code=422, content=body_out.model_dump(mode="json"))
    assert result.pov is not None
    if result.kind in ("invalid_transition", "conflict"):
        code = "invalid_transition" if result.kind == "invalid_transition" else "version_conflict"
        conflict = TransitionConflict(code=code, message=CONFLICT_TEXT[code], current=result.pov)
        return JSONResponse(status_code=409, content=conflict.model_dump(mode="json"))
    return result.pov
