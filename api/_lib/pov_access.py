"""Route guard: who may change a PoV.

Reading is for all Delphina staff. Changing a PoV is for an admin, or the Account Executive or
Solution Engineer assigned to it (see pov_rules.may_edit). Every route that writes to a PoV
declares this guard; a test walks the route list and fails if one does not.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Path

from .auth import require_delphina
from .auth_core import Principal
from .pov_team import can_edit

PovId = Annotated[str, Path(min_length=1, max_length=64)]


def editor_of(get_repo: Callable[..., Any]) -> Callable[..., Principal]:
    """A dependency for one router: the signed-in person, if they may change this PoV.
    403 `not_assigned` otherwise. `get_repo` is that router's repo provider (it must offer
    `team(pov_id)`); FastAPI reuses the same repo instance for the route itself."""

    # Defaults, not Annotated[...]: with postponed annotations FastAPI resolves annotation strings
    # against this module's globals, where the closure variable `get_repo` does not exist.
    def editor(pov_id: PovId, staff: Principal = Depends(require_delphina), repo: Any = Depends(get_repo)) -> Principal:  # noqa: B008
        if staff.is_admin:
            return staff
        state = repo.team(pov_id)
        if state is None:
            raise HTTPException(status_code=404, detail="pov_not_found")
        if not can_edit(state, staff.email, False):
            raise HTTPException(status_code=403, detail="not_assigned")
        return staff

    editor.guards_pov_writes = True  # type: ignore[attr-defined]  # what the route-coverage test looks for
    return editor
