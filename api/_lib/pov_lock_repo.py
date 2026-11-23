"""BigQuery implementation of LockRepo. Reuses the item repo's client, deadline and retry."""

from __future__ import annotations

from datetime import date
from typing import Literal

from .pov_bigquery import pov_table
from .pov_item_repo import BigQueryItemRepo, _to_query_param
from .pov_item_specs import CRITERION, MILESTONE, PAIN_POINT, STAKEHOLDER
from .pov_lock_service import AGREED, AGREED_FIELD, PARTS
from .pov_lock_sql import build_transition_script
from .pov_repo import _json, _param

_PART_SPECS = (("pain_points", PAIN_POINT), ("stakeholders", STAKEHOLDER), ("criteria", CRITERION), ("milestones", MILESTONE))


def build_parts_query() -> str:
    """The whole plan in ONE query job (each BigQuery job costs about a second): one array per table,
    explicit columns, every subquery filtered on pov_id (the cluster key)."""
    live = "pov_id = @pov_id AND deleted_at IS NULL"
    arrays = [
        f"ARRAY(SELECT AS STRUCT {spec.select_columns} FROM `{pov_table(spec.table)}` WHERE {live} "
        f"ORDER BY {'position, ' if spec.ordered else ''}created_at LIMIT 100) AS {name}"
        for name, spec in _PART_SPECS
    ]
    arrays.append(
        f"ARRAY(SELECT AS STRUCT criterion_id, pain_point_id FROM `{pov_table('criterion_pain_point')}` "
        f"WHERE {live} ORDER BY criterion_id, pain_point_id LIMIT 200) AS links"
    )
    # The Sponsor's agreement is the latest 'sponsor_agreed' row in the change log; it holds only while
    # the PoV's seq still equals that row's seq.
    arrays.append(
        f"(SELECT MAX(seq) FROM `{pov_table('pov_change_log')}` WHERE pov_id = @pov_id "
        f"AND item_kind = 'pov' AND field = '{AGREED_FIELD}') AS {AGREED}"
    )
    return "SELECT\n  " + ",\n  ".join(arrays)


class BigQueryLockRepo(BigQueryItemRepo):
    def plan_parts(self, pov_id: str) -> dict[str, object]:
        rows = self._run(build_parts_query(), [_param("pov_id", "STRING", pov_id)])
        row = dict(rows[0].items()) if rows else {}
        parts: dict[str, object] = {part: [dict(item) for item in row.get(part) or []] for part in PARTS}
        parts[AGREED] = row.get(AGREED)
        return parts

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
    ) -> int:
        sql, params = build_transition_script(
            target,
            pov_table=pov_table("pov"),
            revision_table=pov_table("pov_revision"),
            log_table=pov_table("pov_change_log"),
            pov_id=pov_id,
            from_status=from_status,
            actor=actor,
            op_id=op_id,
            old_json=_json(old),
            new_json=_json(new),
            expected_seq=expected_seq,
            go_threshold=go_threshold,
            no_go_threshold=no_go_threshold,
            baseline_end_date=baseline_end_date,
            snapshot_json=snapshot_json,
        )
        rows = self._run(sql, [_to_query_param(p) for p in params], retry=True)
        if not rows:
            raise RuntimeError("transition write returned no result")
        return int(rows[0]["result"])
