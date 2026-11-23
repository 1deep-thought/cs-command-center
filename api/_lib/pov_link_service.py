"""Use-cases for criterion <-> pain point links. No BigQuery or FastAPI imports."""

from __future__ import annotations

from typing import Literal, Protocol
from uuid import UUID

from .pov_item_service import FROZEN, ItemResult
from .pov_models import PovOwnerView

APPLIED, NO_CHANGE, TARGET_MISSING = 1, 4, 6


class LinkRepo(Protocol):
    def get_pov(self, pov_id: str) -> PovOwnerView | None: ...
    def op_applied(self, pov_id: str, op_id: UUID, item_kind: str, item_id: str) -> bool: ...
    def list_links(self, pov_id: str) -> list[dict[str, str]]: ...
    def write_link(
        self,
        mode: Literal["add", "remove"],
        *,
        pov_id: str,
        criterion_id: str,
        pain_point_id: str,
        actor: str,
        op_id: str,
    ) -> int: ...


def list_links(repo: LinkRepo, pov_id: str) -> list[dict[str, str]] | None:
    """None = no such PoV."""
    return repo.list_links(pov_id) if repo.get_pov(pov_id) is not None else None


def change_link(
    repo: LinkRepo,
    mode: Literal["add", "remove"],
    pov_id: str,
    criterion_id: str,
    pain_point_id: str,
    op_id: UUID,
    actor: str,
) -> ItemResult:
    link = {"criterion_id": criterion_id, "pain_point_id": pain_point_id}
    applied = ItemResult("applied", link if mode == "add" else None)
    if repo.get_pov(pov_id) is not None and repo.op_applied(pov_id, op_id, "criterion_link", criterion_id):
        return applied  # a retry of a change that already went through, even if the link has changed since
    code = repo.write_link(
        mode, pov_id=pov_id, criterion_id=criterion_id, pain_point_id=pain_point_id, actor=actor, op_id=str(op_id)
    )
    if code in (APPLIED, NO_CHANGE):  # already in the requested state is success (links are a set)
        return applied
    if code == TARGET_MISSING:
        return ItemResult("not_found")
    if code == FROZEN:  # PoV missing, or its plan is locked
        return ItemResult("not_found") if repo.get_pov(pov_id) is None else ItemResult("frozen")
    raise RuntimeError(f"unexpected link write result {code}")
