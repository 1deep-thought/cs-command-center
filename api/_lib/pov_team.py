"""Who at Delphina runs a PoV: its assigned Account Executive and Solution Engineer.

No BigQuery or FastAPI imports. Assignments live in `pov_member` (one live row per role);
`may_edit` in pov_rules decides what an assignment allows.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, Protocol

from .pov_models import TeamAssign
from .pov_rules import may_edit, team_of


class TeamRepo(Protocol):
    def team(self, pov_id: str) -> dict[str, object] | None:
        """{"owner_email": str, "members": [{"email", "role"}]} for a live PoV, else None."""
        ...

    def write_team(self, *, pov_id: str, changes: dict[str, tuple[str | None, str | None]], actor: str, op_id: str) -> None:
        """`changes`: role -> (old email, new email). For each, retire the live row and, when the
        new email is set, add one; all in one transaction, each logged."""
        ...


@dataclass(frozen=True)
class TeamResult:
    kind: Literal["applied", "not_found", "forbidden", "invalid"]
    team: dict[str, str | None] | None = None
    code: str | None = None


def members_of(state: dict[str, object]) -> list[dict[str, object]]:
    members = state.get("members")
    return list(members) if isinstance(members, list) else []


def can_edit(state: dict[str, object], actor: str, is_admin: bool) -> bool:
    return may_edit(actor=actor, is_admin=is_admin, owner_email=str(state.get("owner_email") or ""), members=members_of(state))


def assign(
    repo: TeamRepo,
    pov_id: str,
    body: TeamAssign,
    actor: str,
    *,
    is_admin: bool = False,
    is_staff: Callable[[str], bool] | None = None,
) -> TeamResult:
    """Set who runs a PoV. Allowed at any status: who runs a plan is not part of what the Sponsor
    agreed to, so nothing here touches the plan's `seq`.

    The caller's right is checked once, against the team as it stands, and every role in the
    request is then written together. (Two requests would let the first one remove the caller's
    right to send the second.)"""
    state = repo.team(pov_id)
    if state is None:
        return TeamResult("not_found")
    if not can_edit(state, actor, is_admin):
        return TeamResult("forbidden", code="not_assigned")
    current = team_of(members_of(state))
    changes = {role: (current[role], email) for role, email in body.changes().items() if current[role] != email}
    if not changes:
        return TeamResult("applied", current)  # already so: a retry or a second click
    for _, email in changes.values():
        if email is not None and (is_staff is None or not is_staff(email)):
            return TeamResult("invalid", current, code="not_staff")  # fail closed without a way to check
    repo.write_team(pov_id=pov_id, changes=changes, actor=actor, op_id=str(body.op_id))
    latest = repo.team(pov_id)
    expected = {**current, **{role: email for role, (_, email) in changes.items()}}
    return TeamResult("applied", team_of(members_of(latest)) if latest else expected)
