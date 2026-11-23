"""Pain point, stakeholder and criterion endpoints (Delphina staff).

No `from __future__ import annotations` here on purpose: the routes are built in a loop
from per-kind models, and FastAPI needs those annotations as real objects.
"""

import logging
import os
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.responses import JSONResponse, Response

from api._lib.auth import require_delphina
from api._lib.auth_core import Principal
from api._lib.pov_bigquery import CREDENTIALS_ENV
from api._lib.pov_item_service import ItemRepo, ItemResult, create_item, delete_item, list_items, patch_item
from api._lib.pov_item_specs import SPECS, ItemSpec
from api._lib.pov_items import ItemConflict

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/py/pov", tags=["pov-items"], dependencies=[Depends(require_delphina)])

Staff = Annotated[Principal, Depends(require_delphina)]
PovId = Annotated[str, Path(min_length=1, max_length=64)]
ItemId = Annotated[str, Path(min_length=1, max_length=64)]

CONFLICT_TEXT = {
    "version_conflict": "Someone else changed this first.",
    "plan_frozen": "The plan is locked.",
    "limit_reached": "This plan is at its limit for this kind of item.",
}


def get_item_repo() -> ItemRepo:
    """Overridden in tests. Fails closed with 503 when the PoV store is not configured."""
    if not os.environ.get(CREDENTIALS_ENV):
        raise HTTPException(status_code=503, detail="pov_store_not_configured")
    from api._lib.pov_item_repo import BigQueryItemRepo  # lazy: importing the app never needs BigQuery

    return BigQueryItemRepo()


Repo = Annotated[ItemRepo, Depends(get_item_repo)]


def _respond(spec: ItemSpec, result: ItemResult, *, success: int = 200):
    """Map a service result to HTTP. Returns the item (or 204) on success, raises/returns errors otherwise."""
    view = lambda item: spec.view(**item).model_dump(mode="json")  # noqa: E731
    if result.kind == "not_found":
        raise HTTPException(status_code=404, detail="not_found")
    if result.kind == "invalid":
        raise HTTPException(status_code=422, detail=result.code)
    if result.kind == "applied":
        if result.item is None:
            return Response(status_code=204)
        return JSONResponse(status_code=success, content=view(result.item))
    code = {"conflict": "version_conflict", "frozen": "plan_frozen", "limit": "limit_reached"}[result.kind]
    body = ItemConflict(
        code=code,
        message=CONFLICT_TEXT[code],
        current=view(result.item) if result.item else None,
    )
    return JSONResponse(status_code=409, content=body.model_dump(mode="json"))


def _register(spec: ItemSpec) -> None:
    Create, Patch, View = spec.create, spec.patch, spec.view
    base = f"/{{pov_id}}/{spec.segment}"
    conflict = {409: {"model": ItemConflict}}

    @router.get(base, response_model=list[View], name=f"list_{spec.kind}")
    def list_all(pov_id: PovId, repo: Repo):
        items = list_items(repo, spec, pov_id)
        if items is None:
            raise HTTPException(status_code=404, detail="pov_not_found")
        return items

    @router.post(base, response_model=View, status_code=201, responses=conflict, name=f"create_{spec.kind}")
    def create(pov_id: PovId, body: Create, staff: Staff, repo: Repo):
        return _respond(spec, create_item(repo, spec, pov_id, body, staff.email), success=201)

    @router.patch(base + "/{item_id}", response_model=View, responses=conflict, name=f"update_{spec.kind}")
    def update(pov_id: PovId, item_id: ItemId, body: Patch, staff: Staff, repo: Repo):
        return _respond(spec, patch_item(repo, spec, pov_id, item_id, body, staff.email))

    @router.delete(base + "/{item_id}", status_code=204, responses=conflict, name=f"delete_{spec.kind}")
    def remove(
        pov_id: PovId,
        item_id: ItemId,
        staff: Staff,
        repo: Repo,
        base_version: Annotated[int, Query(ge=1)],
        op_id: Annotated[UUID, Query()],
    ):
        result = delete_item(repo, spec, pov_id, item_id, base_version=base_version, op_id=op_id, actor=staff.email)
        return _respond(spec, result)


for _spec in SPECS:
    _register(_spec)
