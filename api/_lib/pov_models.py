"""Pydantic contract for the PoV API. Mirror every change in src/types/pov.ts."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints, model_validator

PovStatus = Literal["draft", "collaborating", "locked", "decided"]
PovDecision = Literal["go", "extend", "no_go"]

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Domain = Annotated[
    str,
    # Normalise first: the pattern is checked on the normalised value.
    BeforeValidator(lambda v: v.strip().lower() if isinstance(v, str) else v),
    StringConstraints(
        max_length=253,
        pattern=r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$",
    ),
]
Currency = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
AccountId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
Threshold = Annotated[int, Field(ge=1, le=100)]
Email = Annotated[
    str,
    BeforeValidator(lambda v: v.strip().lower() if isinstance(v, str) else v),
    StringConstraints(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"),
]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PovCreate(Strict):
    # Optional client-generated UUID. A retried create with the same op_id returns the
    # PoV it already made instead of a duplicate.
    op_id: UUID | None = None
    title: Name
    prospect_name: Name
    prospect_domain: Domain | None = None
    currency: Currency = "USD"
    account_id: AccountId | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def _dates_in_order(self) -> PovCreate:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


# Fields a patch may change, and the ones that may never be set to null.
PATCHABLE_FIELDS: tuple[str, ...] = (
    "title",
    "prospect_name",
    "prospect_domain",
    "account_id",
    "owner_email",
    "start_date",
    "end_date",
    "go_threshold",
    "no_go_threshold",
)
NON_NULLABLE_FIELDS = frozenset({"title", "prospect_name", "owner_email"})


class PovPatch(Strict):
    """Only the fields sent are changed. `base_version` is the version the editor saw;
    `op_id` makes a retried request idempotent."""

    base_version: int = Field(ge=1)
    op_id: UUID
    title: Name | None = None
    prospect_name: Name | None = None
    prospect_domain: Domain | None = None
    account_id: AccountId | None = None
    owner_email: Email | None = None
    start_date: date | None = None
    end_date: date | None = None
    go_threshold: Threshold | None = None
    no_go_threshold: Threshold | None = None

    @model_validator(mode="after")
    def _check(self) -> PovPatch:
        sent = [f for f in PATCHABLE_FIELDS if f in self.model_fields_set]
        if not sent:
            raise ValueError("no fields to change")
        for f in sent:
            if f in NON_NULLABLE_FIELDS and getattr(self, f) is None:
                raise ValueError(f"{f} cannot be cleared")
        return self

    def changes(self) -> dict[str, object]:
        return {f: getattr(self, f) for f in PATCHABLE_FIELDS if f in self.model_fields_set}


class PovOwnerView(BaseModel):
    """Everything about a PoV that Delphina staff may see."""

    pov_id: str
    title: str
    prospect_name: str
    prospect_domain: str | None
    status: PovStatus
    decision: PovDecision | None
    currency: str
    start_date: date | None
    end_date: date | None
    baseline_end_date: date | None
    go_threshold: int | None
    no_go_threshold: int | None
    owner_email: str
    account_id: str | None
    seq: int
    version: int
    created_by: str | None
    created_at: datetime
    updated_by: str | None
    updated_at: datetime


class PovListItem(BaseModel):
    pov_id: str
    title: str
    prospect_name: str
    status: PovStatus
    decision: PovDecision | None
    currency: str
    end_date: date | None
    owner_email: str
    version: int
    updated_at: datetime
    # The decision milestone's date, when the plan has one (the list's "Decision by").
    decision_date: date | None = None
    # The customer account this PoV belongs to or turned into, when known.
    account_id: str | None = None
    # The assigned Account Executive and Solution Engineer, when set (table pov_member).
    ae_email: str | None = None
    se_email: str | None = None
    # Delphina's estimated investment in this PoV, in USD cents (see pov_rules.investment).
    # None until the plan has kickoff and decision dates.
    invest_minor: int | None = None


class Team(BaseModel):
    """Who at Delphina runs a PoV. Either may be unassigned."""

    ae: str | None = None
    se: str | None = None


class TeamAssign(BaseModel):
    """POST /{pov_id}/team: set the Account Executive, the Solution Engineer, or both, in one
    request (null clears a role; a role left out is untouched). Both in one request matters:
    the first change can remove the caller's own right to make the second."""

    model_config = ConfigDict(extra="forbid")

    ae: Email | None = None
    se: Email | None = None
    op_id: UUID

    def changes(self) -> dict[str, str | None]:
        return {role: getattr(self, role) for role in ("ae", "se") if role in self.model_fields_set}

    @model_validator(mode="after")
    def _not_empty(self) -> TeamAssign:
        if not self.changes():
            raise ValueError("name at least one role to change: ae or se")
        return self


class StaffMember(BaseModel):
    """Someone at Delphina who can sign in. Email only: who is an admin is not for everyone."""

    email: str


class Investment(BaseModel):
    """Delphina's planned team time on a PoV, as money. An estimate from the plan's length."""

    days: int
    se_hours: int
    ae_hours: int
    total_minor: int
    currency: Literal["USD"]


class PovConflict(BaseModel):
    """409 body: the editor's version is stale, or the plan is frozen."""

    code: Literal["version_conflict", "plan_frozen"]
    message: str
    current: PovOwnerView
    changed_by: str | None
    changed_at: datetime


# ------------------------------------------------------------------ readiness and transitions

TransitionTarget = Literal["collaborating", "locked", "decided"]
ReadinessKey = Literal["pain_points", "stakeholders", "criteria", "links", "dates", "sponsor_agreed"]


class ReadinessProblem(BaseModel):
    """Why a check fails. `item_kind`/`item_id` name the row to fix; both null when the problem is the set."""

    code: str
    item_kind: Literal["pain_point", "stakeholder", "criterion", "milestone"] | None = None
    item_id: str | None = None


class ReadinessCheck(BaseModel):
    key: ReadinessKey
    ok: bool
    problems: list[ReadinessProblem]


class Readiness(BaseModel):
    """The six lock checks for a plan as it stands at `seq`, and what the caller may do next."""

    pov_id: str
    status: PovStatus
    seq: int
    ready: bool
    passed: int
    total: int
    checks: list[ReadinessCheck]
    # True when the viewer may change this plan: an admin, or its assigned Account Executive or
    # Solution Engineer (the name predates assignments, when that person was "the owner").
    is_owner: bool
    allowed_transitions: list[TransitionTarget]


class TransitionIn(Strict):
    """Move the plan forward. Asking for the status it already has is a success, so retries are safe."""

    to: TransitionTarget
    op_id: UUID
    # Only when locking. Omitted: keep what the plan has, else the defaults (80 and 60).
    go_threshold: Threshold | None = None
    no_go_threshold: Threshold | None = None
    # Only when deciding. The decision is the owner's call; the score and thresholds advise it.
    decision: PovDecision | None = None
    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)] | None = None

    @model_validator(mode="after")
    def _check(self) -> TransitionIn:
        if self.to != "locked" and (self.go_threshold is not None or self.no_go_threshold is not None):
            raise ValueError("thresholds are set when locking")
        if self.to == "decided" and self.decision is None:
            raise ValueError("a decision is needed: go, extend or no_go")
        if self.to != "decided" and (self.decision is not None or self.note is not None):
            raise ValueError("decision and note are set when deciding")
        return self


class SponsorAgreementIn(Strict):
    """The owner records that the Sponsor agreed to the plan as it stands (stand-in for the Sponsor's
    own "Agree to plan"). Recording it again for an unchanged plan is a success."""

    op_id: UUID


class TransitionConflict(BaseModel):
    """409 body: the plan is not in a status this move starts from, or it changed while locking (retry)."""

    code: Literal["invalid_transition", "version_conflict"]
    message: str
    current: PovOwnerView


class NotReady(BaseModel):
    """422 body when a lock is refused because a check fails."""

    detail: Literal["not_ready"]
    readiness: Readiness
