"""Readiness and status moves (Start collaborating, Lock plan). No BigQuery or FastAPI imports.

Locking reads the whole plan once, runs the six checks on it, and writes only if nothing changed
since that read (the write is gated on the PoV's change counter), so a plan can never lock on
checks that were true a moment ago.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from typing import Literal, Protocol

from .pov_models import PovOwnerView, Readiness, TransitionIn
from .pov_rules import DEFAULT_GO, DEFAULT_NO_GO, TRANSITIONS, allowed_transitions, readiness

APPLIED, MISSING, STALE = 1, 0, 2
PARTS = ("pain_points", "stakeholders", "criteria", "links", "milestones")
AGREED = "sponsor_agreed_seq"
AGREED_FIELD = "sponsor_agreed"  # change-log `field` of the row that records the Sponsor's agreement


class LockRepo(Protocol):
    def get_pov(self, pov_id: str) -> PovOwnerView | None: ...
    def plan_parts(self, pov_id: str) -> dict[str, object]:
        """Live rows of the plan, keyed by PARTS, plus AGREED: the change counter at which the Sponsor
        last agreed (None if never). The agreement is a change-log row, so it needs no column."""
        ...
    def write_transition(
        self,
        target: Literal["collaborating", "locked"],
        *,
        pov_id: str,
        from_status: str,
        actor: str,
        op_id: str,
        old: dict[str, object],
        new: dict[str, object],
        expected_seq: int | None = None,
        go_threshold: int | None = None,
        no_go_threshold: int | None = None,
        baseline_end_date: date | None = None,
        snapshot_json: str | None = None,
    ) -> int: ...


@dataclass(frozen=True)
class TransitionResult:
    kind: Literal["applied", "not_found", "forbidden", "invalid_transition", "not_ready", "conflict", "invalid"]
    pov: PovOwnerView | None = None
    readiness: Readiness | None = None
    code: str | None = None


def is_owner(pov: PovOwnerView, actor: str) -> bool:
    return pov.owner_email.strip().lower() == actor.strip().lower()


def _rows(parts: dict[str, object]) -> dict[str, list[dict[str, object]]]:
    return {part: list(parts.get(part) or []) for part in PARTS}  # type: ignore[call-overload]


def _readiness(pov: PovOwnerView, parts: dict[str, object], actor: str) -> Readiness:
    agreed = parts.get(AGREED)
    checks = readiness(seq=pov.seq, sponsor_agreed_seq=agreed if isinstance(agreed, int) else None, **_rows(parts))
    passed = sum(1 for c in checks if c["ok"])
    ready = passed == len(checks)
    return Readiness(
        pov_id=pov.pov_id,
        status=pov.status,
        seq=pov.seq,
        ready=ready,
        passed=passed,
        total=len(checks),
        checks=checks,  # type: ignore[arg-type]
        allowed_transitions=allowed_transitions(pov.status, is_owner=is_owner(pov, actor), ready=ready),  # type: ignore[arg-type]
    )


def get_readiness(repo: LockRepo, pov_id: str, actor: str) -> Readiness | None:
    """None = no such PoV."""
    pov = repo.get_pov(pov_id)
    if pov is None:
        return None
    return _readiness(pov, repo.plan_parts(pov_id), actor)


def _dumps(value: object) -> str:
    # Dates, timestamps and NUMERIC values are stored as text in the snapshot.
    return json.dumps(value, default=lambda v: v.isoformat() if isinstance(v, date) else str(v), sort_keys=True)


def transition(repo: LockRepo, pov_id: str, body: TransitionIn, actor: str) -> TransitionResult:
    pov = repo.get_pov(pov_id)
    if pov is None:
        return TransitionResult("not_found")
    if not is_owner(pov, actor):
        return TransitionResult("forbidden", pov)
    target = body.to
    if pov.status == target:
        return TransitionResult("applied", pov)  # already there: a retry, or a second click
    from_status = TRANSITIONS[target]
    if pov.status != from_status:
        return TransitionResult("invalid_transition", pov)

    old: dict[str, object] = {"status": pov.status}
    new: dict[str, object] = {"status": target}
    extra: dict[str, object] = {}
    if target == "locked":
        go = body.go_threshold or pov.go_threshold or DEFAULT_GO
        no_go = body.no_go_threshold or pov.no_go_threshold or DEFAULT_NO_GO
        if go <= no_go:
            return TransitionResult("invalid", pov, code="invalid_thresholds")
        parts = repo.plan_parts(pov_id)
        state = _readiness(pov, parts, actor)
        if not state.ready:
            return TransitionResult("not_ready", pov, readiness=state)
        rows = _rows(parts)
        decision = next(m["due_date"] for m in rows["milestones"] if m["kind"] == "decision")
        assert isinstance(decision, date)  # the dates check passed, so it is set
        old.update(go_threshold=pov.go_threshold, no_go_threshold=pov.no_go_threshold)
        new.update(go_threshold=go, no_go_threshold=no_go, baseline_end_date=decision)
        agreed = pov.model_copy(  # the PoV row as it will be once locked
            update={
                "status": "locked", "seq": pov.seq + 1, "version": pov.version + 1,
                "go_threshold": go, "no_go_threshold": no_go, "baseline_end_date": decision,
            }
        )
        extra = {
            "expected_seq": pov.seq,
            "go_threshold": go,
            "no_go_threshold": no_go,
            "baseline_end_date": decision,
            # The agreed baseline: the plan exactly as it was checked.
            "snapshot_json": _dumps({"pov": agreed.model_dump(mode="json"), AGREED: parts.get(AGREED), **rows}),
        }

    code = repo.write_transition(
        target, pov_id=pov_id, from_status=from_status, actor=actor, op_id=str(body.op_id), old=old, new=new, **extra,  # type: ignore[arg-type]
    )
    latest = repo.get_pov(pov_id)
    if code == MISSING or latest is None:
        return TransitionResult("not_found")
    if code == APPLIED or latest.status == target:  # the second case: our own twin request got there first
        return TransitionResult("applied", latest)
    if latest.status != from_status:
        return TransitionResult("invalid_transition", latest)
    return TransitionResult("conflict", latest)  # edited while locking: re-read readiness and try again
