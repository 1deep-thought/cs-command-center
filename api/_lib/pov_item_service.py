"""Use-cases for pain points, stakeholders and criteria. No BigQuery or FastAPI imports.

Same shape as pov_service: check rules on current state, make one versioned write, and
treat a retry of an operation that already applied as success.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal, Protocol
from uuid import UUID, uuid4

from .pov_item_specs import MILESTONE, PAIN_POINT, ItemSpec
from .pov_milestone_rules import invalid_milestone_dates
from .pov_models import PovOwnerView
from .pov_rules import invalid_pain_point_change, plan_is_editable

# write_item result codes (see pov_item_sql)
APPLIED, FROZEN, STALE, FULL, EXISTS, DUPLICATE = 1, 0, 2, 3, 4, 5
VALUE_FIELDS = {"value_low_minor", "value_high_minor", "value_basis"}


class ItemRepo(Protocol):
    def get_pov(self, pov_id: str) -> PovOwnerView | None: ...
    def op_applied(
        self, pov_id: str, op_id: UUID, item_kind: str | None = None, item_id: str | None = None
    ) -> bool:
        """With item_kind/item_id, true only if that operation was applied to THAT item."""
        ...
    def list_items(self, spec: ItemSpec, pov_id: str) -> list[dict[str, object]]: ...
    def get_item(self, spec: ItemSpec, pov_id: str, item_id: str) -> dict[str, object] | None: ...
    def write_item(
        self,
        spec: ItemSpec,
        mode: Literal["create", "update", "delete"],
        *,
        pov_id: str,
        item_id: str,
        actor: str,
        op_id: str,
        values: dict[str, object],
        old: dict[str, object],
        base_version: int | None,
    ) -> int: ...


@dataclass(frozen=True)
class ItemResult:
    kind: Literal["applied", "not_found", "frozen", "conflict", "limit", "duplicate", "invalid"]
    item: dict[str, object] | None = None
    code: str | None = None


def list_items(repo: ItemRepo, spec: ItemSpec, pov_id: str) -> list[dict[str, object]] | None:
    """None = no such PoV."""
    if repo.get_pov(pov_id) is None:
        return None
    return repo.list_items(spec, pov_id)


def _outcome(
    repo: ItemRepo, spec: ItemSpec, pov_id: str, item_id: str, code: int, op_id: str, *, deleting: bool = False
) -> ItemResult:
    latest = repo.get_item(spec, pov_id, item_id)
    applied_before = code in (STALE, EXISTS, FULL) and repo.op_applied(pov_id, UUID(op_id), spec.kind, item_id)
    if code == APPLIED or applied_before:
        if deleting:
            return ItemResult("applied")
        # Applied, yet the item is gone: someone deleted it right after. Say so, don't send a blank 200.
        return ItemResult("applied", latest) if latest is not None else ItemResult("not_found")
    if code == FROZEN:
        return ItemResult("frozen", latest)
    if code == FULL:
        return ItemResult("limit")
    if code == DUPLICATE:
        return ItemResult("duplicate")
    if latest is None:
        return ItemResult("not_found") if code == STALE else ItemResult("conflict")  # EXISTS but deleted
    return ItemResult("conflict", latest)


def _apply_value_rules(current: dict[str, object], changes: dict[str, object], actor: str) -> str | None:
    """Keep value_source honest as the numbers change. Mutates `changes`; returns an error code or None."""

    def merged(field: str):
        return changes[field] if field in changes else current.get(field)

    touched = bool(VALUE_FIELDS & changes.keys())
    if merged("value_low_minor") is None:  # numbers cleared (or never set): nothing to attribute
        if touched or changes.get("value_source") == "verified":
            if changes.get("value_source") == "verified":
                return "verification_needs_value_and_basis"
            changes.update(value_source=None, verified_by=None, verified_at=None)
        return None
    if changes.get("value_source") == "verified":
        if merged("value_basis") is None:
            return "verification_needs_value_and_basis"
        if current.get("value_source") != "verified":  # re-sending "verified" must not restamp
            changes.update(verified_by=actor, verified_at=datetime.now(timezone.utc))
    elif touched and current.get("value_source") == "verified":
        # Changing the numbers after verification voids the verification.
        changes.update(value_source="prospect_stated", verified_by=None, verified_at=None)
    elif current.get("value_source") is None and "value_source" not in changes:
        changes["value_source"] = "prospect_stated"  # same as create
    return None


def _milestone_dates(repo: ItemRepo, pov_id: str, item_id: str | None, kind: str, due) -> dict[str, object]:
    dates = {m["kind"]: m["due_date"] for m in repo.list_items(MILESTONE, pov_id) if m["milestone_id"] != item_id}
    dates[kind] = due
    return dates


def _seq_kw(seq: int | None) -> dict[str, int]:
    return {} if seq is None else {"expected_seq": seq}


def create_item(repo: ItemRepo, spec: ItemSpec, pov_id: str, data, actor: str) -> ItemResult:
    pov = repo.get_pov(pov_id)
    if pov is None:
        return ItemResult("not_found")
    item_id = str(data.op_id) if data.op_id else str(uuid4())
    existing = repo.get_item(spec, pov_id, item_id)
    if existing is not None:
        return ItemResult("applied", existing)  # a retry of a create that already succeeded
    if not plan_is_editable(pov.status):
        return ItemResult("frozen")

    seq = None
    if spec is MILESTONE:
        if any(m["kind"] == data.kind for m in repo.list_items(MILESTONE, pov_id)):
            return ItemResult("duplicate")
        error = invalid_milestone_dates(_milestone_dates(repo, pov_id, None, data.kind, data.due_date))
        if error:
            return ItemResult("invalid", code=error)
        seq = pov.seq  # read before the list above; the write fails as stale if anything changed since
    values: dict[str, object] = {**spec.defaults}
    values.update(data.model_dump(exclude={"op_id"}, exclude_none=True))
    if spec is PAIN_POINT and values.get("value_low_minor") is not None:
        values["value_source"] = "prospect_stated"
    code = repo.write_item(
        spec, "create", pov_id=pov_id, item_id=item_id, actor=actor, op_id=item_id,
        values=values, old={}, base_version=None, **_seq_kw(seq),
    )
    if spec is MILESTONE and code == STALE:
        return ItemResult("conflict")  # plan changed under us: re-read and retry
    return _outcome(repo, spec, pov_id, item_id, code, item_id)


def patch_item(repo: ItemRepo, spec: ItemSpec, pov_id: str, item_id: str, patch, actor: str) -> ItemResult:
    pov = repo.get_pov(pov_id)
    current = repo.get_item(spec, pov_id, item_id) if pov else None
    if pov is None or current is None:
        return ItemResult("not_found")
    if repo.op_applied(pov_id, patch.op_id, spec.kind, item_id):
        return ItemResult("applied", current)
    if not plan_is_editable(pov.status):
        return ItemResult("frozen", current)
    if current["version"] != patch.base_version:
        return ItemResult("conflict", current)

    changes = patch.changes()
    seq = None
    if spec is MILESTONE:
        if "due_date" in changes and changes["due_date"] == current.get("due_date"):
            del changes["due_date"]  # unchanged: not a write
        seq = pov.seq
    if spec is PAIN_POINT:
        if (error := invalid_pain_point_change(current, changes)) is not None:
            return ItemResult("invalid", current, code=error)
        if (error := _apply_value_rules(current, changes, actor)) is not None:
            return ItemResult("invalid", current, code=error)
    if spec is MILESTONE:
        if "due_date" in changes:
            error = invalid_milestone_dates(_milestone_dates(repo, pov_id, item_id, current["kind"], changes["due_date"]))
            if error:
                return ItemResult("invalid", current, code=error)
        if "completed" in changes:
            done = changes.pop("completed")
            if done and current.get("completed_at") is None:
                changes["completed_at"] = datetime.now(timezone.utc)
            elif not done and current.get("completed_at") is not None:
                changes["completed_at"] = None
        if not changes:  # e.g. marking an already-completed milestone complete: nothing to write
            return ItemResult("applied", current)
    old = {f: current.get(f) for f in changes}
    code = repo.write_item(
        spec, "update", pov_id=pov_id, item_id=item_id, actor=actor, op_id=str(patch.op_id),
        values=changes, old=old, base_version=patch.base_version, **_seq_kw(seq),
    )
    return _outcome(repo, spec, pov_id, item_id, code, str(patch.op_id))


def delete_item(
    repo: ItemRepo, spec: ItemSpec, pov_id: str, item_id: str, *, base_version: int, op_id: UUID, actor: str
) -> ItemResult:
    pov = repo.get_pov(pov_id)
    if pov is None:
        return ItemResult("not_found")
    if repo.op_applied(pov_id, op_id, spec.kind, item_id):
        return ItemResult("applied")  # retry of a delete that already went through
    current = repo.get_item(spec, pov_id, item_id)
    if current is None:
        return ItemResult("not_found")
    if not plan_is_editable(pov.status):
        return ItemResult("frozen", current)
    if current["version"] != base_version:
        return ItemResult("conflict", current)
    code = repo.write_item(
        spec, "delete", pov_id=pov_id, item_id=item_id, actor=actor, op_id=str(op_id),
        values={}, old=current, base_version=base_version,
    )
    return _outcome(repo, spec, pov_id, item_id, code, str(op_id), deleting=True)
