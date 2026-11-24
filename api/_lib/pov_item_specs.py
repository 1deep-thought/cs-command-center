"""One spec per child table. The write path is generic; only this file knows column names.
Column names in SQL come ONLY from these specs, never from a request."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final

from pydantic import BaseModel

from .pov_items import (
    CriterionCreate,
    CriterionPatch,
    CriterionView,
    MilestoneCreate,
    MilestonePatch,
    MilestoneView,
    PainPointCreate,
    PainPointPatch,
    PainPointView,
    StakeholderCreate,
    StakeholderPatch,
    StakeholderView,
)


@dataclass(frozen=True)
class ItemSpec:
    kind: str  # also the change-log item_kind
    segment: str  # URL segment
    table: str  # key in pov_bigquery.POV_TABLES
    id_column: str
    fields: dict[str, str]  # writable column -> BigQuery type ("ARRAY<STRING>" for repeated)
    view_columns: tuple[str, ...]
    max_items: int | None
    ordered: bool  # has a `position` column
    create: type[BaseModel]
    patch: type[BaseModel]
    view: type[BaseModel]
    defaults: dict[str, object] = field(default_factory=dict)  # stored on create when not sent
    actor_columns: bool = True  # table has created_by / updated_by
    virtual: frozenset[str] = frozenset()  # request fields the service translates into columns
    unique_field: str | None = None  # at most one live item per value of this column (per PoV)
    cascade: tuple[tuple[str, str], ...] = ()  # (table, column): soft-delete these rows with the item

    @property
    def select_columns(self) -> str:
        return ", ".join(self.view_columns)


_AUDIT_UNORDERED = ("pov_id", "version", "created_by", "created_at", "updated_by", "updated_at")
_AUDIT = (_AUDIT_UNORDERED[0], "position", *_AUDIT_UNORDERED[1:])

PAIN_POINT: Final = ItemSpec(
    kind="pain_point",
    segment="pain-points",
    table="pain_point",
    id_column="pain_point_id",
    fields={
        "title": "STRING",
        "description": "STRING",
        "raised_by": "STRING",
        "value_low_minor": "INT64",
        "value_high_minor": "INT64",
        "value_basis": "STRING",
        "value_source": "STRING",
        "verified_by": "STRING",
        "verified_at": "TIMESTAMP",
        "solve_bucket": "STRING",
    },
    view_columns=(
        "pain_point_id", "title", "description", "raised_by", "value_low_minor", "value_high_minor",
        "value_basis", "value_source", "verified_by", "verified_at", "solve_bucket", *_AUDIT,
    ),
    max_items=5,
    ordered=True,
    create=PainPointCreate,
    patch=PainPointPatch,
    view=PainPointView,
    cascade=(("criterion_pain_point", "pain_point_id"),),
)

STAKEHOLDER: Final = ItemSpec(
    kind="stakeholder",
    segment="stakeholders",
    table="stakeholder",
    id_column="stakeholder_id",
    fields={
        "name": "STRING",
        "email": "STRING",
        "job_title": "STRING",
        "roles": "ARRAY<STRING>",
        "is_active": "BOOL",
    },
    view_columns=("stakeholder_id", "name", "email", "job_title", "roles", "is_active", *_AUDIT_UNORDERED),
    max_items=25,
    ordered=False,
    create=StakeholderCreate,
    patch=StakeholderPatch,
    view=StakeholderView,
    defaults={"is_active": True},
)

CRITERION: Final = ItemSpec(
    kind="criterion",
    segment="criteria",
    table="success_criterion",
    id_column="criterion_id",
    fields={
        "statement": "STRING",
        "target_value": "NUMERIC",
        "unit": "STRING",
        "is_yes_no": "BOOL",
        "weight_pct": "INT64",
        "scorer_id": "STRING",
        "evidence_source": "STRING",
        "result_value": "NUMERIC",
        "score": "NUMERIC",
        "measurement_ref": "STRING",
    },
    view_columns=(
        "criterion_id", "statement", "target_value", "unit", "is_yes_no", "weight_pct", "scorer_id",
        "evidence_source", "result_value", "score", "measurement_ref", *_AUDIT,
    ),
    max_items=6,
    ordered=True,
    create=CriterionCreate,
    patch=CriterionPatch,
    view=CriterionView,
    cascade=(("criterion_pain_point", "criterion_id"),),
)

MILESTONE: Final = ItemSpec(
    kind="milestone",
    segment="milestones",
    table="milestone",
    id_column="milestone_id",
    fields={"kind": "STRING", "due_date": "DATE", "completed_at": "TIMESTAMP"},
    view_columns=(
        "milestone_id", "pov_id", "kind", "due_date", "completed_at", "version", "created_at", "updated_at",
    ),
    max_items=4,
    ordered=False,
    create=MilestoneCreate,
    patch=MilestonePatch,
    view=MilestoneView,
    actor_columns=False,
    virtual=frozenset({"completed"}),
    unique_field="kind",
)

SPECS: Final = (PAIN_POINT, STAKEHOLDER, CRITERION, MILESTONE)
