"""PoV use-cases: rules first, then one versioned write. No BigQuery or FastAPI imports."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID, uuid4

from .pov_models import PovCreate, PovListItem, PovOwnerView, PovPatch
from .pov_rules import invalid_changes, plan_is_editable


class PovRepo(Protocol):
    def insert(self, pov_id: str, data: PovCreate, owner_email: str) -> None: ...
    def get(self, pov_id: str) -> PovOwnerView | None: ...
    def list(self) -> list[PovListItem]: ...
    def op_applied(self, pov_id: str, op_id: UUID) -> bool: ...
    def apply_patch(
        self,
        pov_id: str,
        *,
        base_version: int,
        op_id: UUID,
        actor: str,
        changes: dict[str, object],
        old: dict[str, object],
    ) -> bool:
        """Apply only if the stored version still equals base_version. False = lost the race."""
        ...


@dataclass(frozen=True)
class PatchResult:
    kind: Literal["applied", "not_found", "frozen", "conflict", "invalid"]
    pov: PovOwnerView | None = None
    code: str | None = None


def create_pov(repo: PovRepo, data: PovCreate, owner_email: str) -> PovOwnerView:
    pov_id = str(data.op_id) if data.op_id else str(uuid4())
    existing = repo.get(pov_id)
    if existing is not None:
        return existing  # a retry of a create that already succeeded
    repo.insert(pov_id, data, owner_email)
    created = repo.get(pov_id)
    if created is None:  # the write we just made is not readable: surface, never fake it
        raise RuntimeError("created PoV could not be read back")
    return created


def list_povs(repo: PovRepo) -> list[PovListItem]:
    return repo.list()


def get_pov(repo: PovRepo, pov_id: str) -> PovOwnerView | None:
    return repo.get(pov_id)


def patch_pov(repo: PovRepo, pov_id: str, patch: PovPatch, actor: str) -> PatchResult:
    current = repo.get(pov_id)
    if current is None:
        return PatchResult("not_found")

    # A retry of an already-applied operation succeeds (its base_version is now stale).
    if repo.op_applied(pov_id, patch.op_id):
        return PatchResult("applied", current)

    if not plan_is_editable(current.status):
        return PatchResult("frozen", current)
    if current.version != patch.base_version:
        return PatchResult("conflict", current)

    changes = patch.changes()
    error = invalid_changes(
        current_start=current.start_date,
        current_end=current.end_date,
        current_go=current.go_threshold,
        current_no_go=current.no_go_threshold,
        changes=changes,
    )
    if error:
        return PatchResult("invalid", current, code=error)

    old = {field: getattr(current, field) for field in changes}
    won = repo.apply_patch(
        pov_id,
        base_version=patch.base_version,
        op_id=patch.op_id,
        actor=actor,
        changes=changes,
        old=old,
    )
    if not won and repo.op_applied(pov_id, patch.op_id):
        won = True  # our own twin request committed first: that is success, not a conflict
    latest = repo.get(pov_id)
    if latest is None:
        return PatchResult("not_found")
    return PatchResult("applied" if won else "conflict", latest)
