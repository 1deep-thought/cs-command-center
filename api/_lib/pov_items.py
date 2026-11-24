"""Pydantic contract for PoV child items: pain points, stakeholders, success criteria.
Mirror every change in src/types/pov-items.ts."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints, model_validator

from .pov_models import PovOwnerView, Readiness

Text120 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Text300 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Text500 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Email = Annotated[
    str,
    BeforeValidator(lambda v: v.strip().lower() if isinstance(v, str) else v),
    StringConstraints(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"),
]
Minor = Annotated[int, Field(ge=0, le=10**12)]  # money in minor units (cents)

SolveBucket = Literal["lt_30d", "m1_3", "m3_6", "m6_12", "gt_12m"]
ValueSource = Literal["prospect_stated", "verified"]
Role = Literal["sponsor", "champion", "evaluator", "data_it_owner", "economic_buyer"]
EvidenceSource = Literal["prospect_data", "telemetry", "test_result", "attestation"]
MilestoneKind = Literal["kickoff", "checkpoint", "readout", "decision"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _ItemView(BaseModel):
    pov_id: str
    position: float | None = None  # stakeholders are unordered
    version: int
    created_by: str | None = None  # milestones have no actor columns
    created_at: datetime
    updated_by: str | None = None
    updated_at: datetime


# ---------------------------------------------------------------- pain points


def _value_pair_ok(low: int | None, high: int | None) -> bool:
    if (low is None) != (high is None):
        return False
    return low is None or high is None or high >= low


class PainPointCreate(Strict):
    op_id: UUID | None = None
    title: Text120
    description: Text500 | None = None
    raised_by: Text120 | None = None
    value_low_minor: Minor | None = None
    value_high_minor: Minor | None = None
    value_basis: Text300 | None = None
    solve_bucket: SolveBucket | None = None

    @model_validator(mode="after")
    def _range(self) -> PainPointCreate:
        if not _value_pair_ok(self.value_low_minor, self.value_high_minor):
            raise ValueError("value range needs both low and high, with high >= low")
        return self


class PainPointPatch(Strict):
    base_version: int = Field(ge=1)
    op_id: UUID
    title: Text120 | None = None
    description: Text500 | None = None
    raised_by: Text120 | None = None
    value_low_minor: Minor | None = None
    value_high_minor: Minor | None = None
    value_basis: Text300 | None = None
    solve_bucket: SolveBucket | None = None
    value_source: ValueSource | None = None

    @model_validator(mode="after")
    def _check(self) -> PainPointPatch:
        sent = self.model_fields_set - {"base_version", "op_id"}
        if not sent:
            raise ValueError("no fields to change")
        if "title" in sent and self.title is None:
            raise ValueError("title cannot be cleared")
        if "value_source" in sent and self.value_source is None:
            raise ValueError("value_source cannot be cleared")
        return self

    def changes(self) -> dict[str, object]:
        return {f: getattr(self, f) for f in self.model_fields_set - {"base_version", "op_id"}}


class PainPointView(_ItemView):
    pain_point_id: str
    title: str
    description: str | None
    raised_by: str | None
    value_low_minor: int | None
    value_high_minor: int | None
    value_basis: str | None
    value_source: ValueSource | None
    verified_by: str | None
    verified_at: datetime | None
    solve_bucket: SolveBucket | None


# --------------------------------------------------------------- stakeholders


def _roles_ok(roles: list[str]) -> str | None:
    if len(set(roles)) != len(roles):
        return "roles must be unique"
    if len(roles) > 2:
        return "at most two roles"
    if "sponsor" in roles and "evaluator" in roles:
        return "a person cannot be both Sponsor and Evaluator"
    return None


class StakeholderCreate(Strict):
    op_id: UUID | None = None
    name: Text120
    email: Email | None = None
    job_title: Text120 | None = None
    roles: list[Role] = Field(default_factory=list)

    @model_validator(mode="after")
    def _roles(self) -> StakeholderCreate:
        if (problem := _roles_ok(self.roles)) is not None:
            raise ValueError(problem)
        return self


class StakeholderPatch(Strict):
    base_version: int = Field(ge=1)
    op_id: UUID
    name: Text120 | None = None
    email: Email | None = None
    job_title: Text120 | None = None
    roles: list[Role] | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def _check(self) -> StakeholderPatch:
        sent = self.model_fields_set - {"base_version", "op_id"}
        if not sent:
            raise ValueError("no fields to change")
        for f in ("name", "roles", "is_active"):
            if f in sent and getattr(self, f) is None:
                raise ValueError(f"{f} cannot be cleared")
        if self.roles is not None and (problem := _roles_ok(self.roles)) is not None:
            raise ValueError(problem)
        return self

    def changes(self) -> dict[str, object]:
        return {f: getattr(self, f) for f in self.model_fields_set - {"base_version", "op_id"}}


class StakeholderView(_ItemView):
    stakeholder_id: str
    name: str
    email: str | None
    job_title: str | None
    roles: list[Role]
    is_active: bool


# ------------------------------------------------------------------- criteria


class CriterionCreate(Strict):
    op_id: UUID | None = None
    statement: Text300
    target_value: Annotated[float, Field(ge=-1e12, le=1e12)] | None = None
    unit: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)] | None = None
    is_yes_no: bool = False
    weight_pct: Annotated[int, Field(ge=0, le=100)] = 0
    scorer_id: Annotated[str, StringConstraints(min_length=1, max_length=64)] | None = None
    evidence_source: EvidenceSource | None = None


class CriterionPatch(Strict):
    base_version: int = Field(ge=1)
    op_id: UUID
    statement: Text300 | None = None
    target_value: Annotated[float, Field(ge=-1e12, le=1e12)] | None = None
    unit: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)] | None = None
    is_yes_no: bool | None = None
    weight_pct: Annotated[int, Field(ge=0, le=100)] | None = None
    scorer_id: Annotated[str, StringConstraints(min_length=1, max_length=64)] | None = None
    evidence_source: EvidenceSource | None = None
    # Results. Only once the plan is locked, and never in the same request as the fields above.
    # `score` is how far the criterion was met, 0 to 100 (the page offers Not met 0, Partly 50, Met 100).
    result_value: Annotated[float, Field(ge=-1e12, le=1e12)] | None = None
    score: Annotated[int, Field(ge=0, le=100)] | None = None
    measurement_ref: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)] | None = None

    @model_validator(mode="after")
    def _check(self) -> CriterionPatch:
        sent = self.model_fields_set - {"base_version", "op_id"}
        if not sent:
            raise ValueError("no fields to change")
        for f in ("statement", "is_yes_no", "weight_pct"):
            if f in sent and getattr(self, f) is None:
                raise ValueError(f"{f} cannot be cleared")
        return self

    def changes(self) -> dict[str, object]:
        return {f: getattr(self, f) for f in self.model_fields_set - {"base_version", "op_id"}}


class CriterionView(_ItemView):
    criterion_id: str
    statement: str
    target_value: float | None
    unit: str | None
    is_yes_no: bool
    weight_pct: int
    scorer_id: str | None
    evidence_source: EvidenceSource | None
    result_value: float | None = None
    score: float | None = None
    measurement_ref: str | None = None


# ------------------------------------------------------------------ milestones


class MilestoneCreate(Strict):
    op_id: UUID | None = None
    kind: MilestoneKind
    due_date: date


class MilestonePatch(Strict):
    base_version: int = Field(ge=1)
    op_id: UUID
    due_date: date | None = None
    completed: bool | None = None  # true stamps completed_at now, false clears it

    @model_validator(mode="after")
    def _check(self) -> MilestonePatch:
        sent = self.model_fields_set - {"base_version", "op_id"}
        if not sent:
            raise ValueError("no fields to change")
        for f in sent:
            if getattr(self, f) is None:
                raise ValueError(f"{f} cannot be cleared")
        return self

    def changes(self) -> dict[str, object]:
        return {f: getattr(self, f) for f in self.model_fields_set - {"base_version", "op_id"}}


class MilestoneView(_ItemView):
    milestone_id: str
    kind: MilestoneKind
    due_date: date | None
    completed_at: datetime | None


# ---------------------------------------------------------------- criterion links


class CriterionLinkIn(Strict):
    """Link a success criterion to the pain point whose value it proves. Idempotent."""

    op_id: UUID
    pain_point_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]


class CriterionLinkView(BaseModel):
    criterion_id: str
    pain_point_id: str


class ItemConflict(BaseModel):
    """409 body for item writes. `current` is the item as stored now (absent when it never existed)."""

    code: Literal["version_conflict", "plan_frozen", "limit_reached", "duplicate_kind"]
    message: str
    current: dict[str, object] | None


# ---------------------------------------------------------------- whole plan


class PlanView(BaseModel):
    """Everything the plan page shows, read in two queries (GET /{pov_id}/plan)."""

    pov: PovOwnerView
    pain_points: list[PainPointView]
    stakeholders: list[StakeholderView]
    criteria: list[CriterionView]
    milestones: list[MilestoneView]
    links: list[CriterionLinkView]
    readiness: Readiness
