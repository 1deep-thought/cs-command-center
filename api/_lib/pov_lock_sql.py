"""Transaction script for moving a plan forward (pure SQL builder, no BigQuery imports).

One script = one transaction: change the status (gated on the status it must come from and, when
locking, on the change counter the readiness checks were read at), take the lock snapshot, write
one change-log row, commit only if the status changed.
Result codes: 1 applied, 0 no such PoV, 2 the plan is not in that status any more or changed since
it was checked.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from .pov_item_sql import LOG_COLUMNS, Param

Target = Literal["collaborating", "locked"]


def build_transition_script(
    target: Target,
    *,
    pov_table: str,
    revision_table: str,
    log_table: str,
    pov_id: str,
    from_status: str,
    actor: str,
    op_id: str,
    old_json: str,
    new_json: str,
    expected_seq: int | None = None,
    go_threshold: int | None = None,
    no_go_threshold: int | None = None,
    baseline_end_date: date | None = None,
    snapshot_json: str | None = None,
) -> tuple[str, list[Param]]:
    params = [
        Param("pov_id", "STRING", pov_id),
        Param("target", "STRING", target),
        Param("from_status", "STRING", from_status),
        Param("actor", "STRING", actor),
        Param("op_id", "STRING", op_id),
        Param("old_json", "STRING", old_json),
        Param("new_json", "STRING", new_json),
    ]
    sets, gate, snapshot = "", "", ""
    if target == "locked":
        if None in (expected_seq, go_threshold, no_go_threshold, baseline_end_date, snapshot_json):
            raise ValueError("locking needs expected_seq, both thresholds, baseline_end_date and a snapshot")
        params += [
            Param("expected_seq", "INT64", expected_seq),
            Param("go_threshold", "INT64", go_threshold),
            Param("no_go_threshold", "INT64", no_go_threshold),
            Param("baseline_end_date", "DATE", baseline_end_date),
            Param("snapshot", "STRING", snapshot_json),
        ]
        # When it locked is the snapshot row's created_at (and the 'status' row in the change log).
        sets = (
            ", go_threshold = @go_threshold, no_go_threshold = @no_go_threshold, "
            "baseline_end_date = @baseline_end_date"
        )
        # The checks were read at this seq: any edit since then means they must be run again.
        gate = " AND seq = @expected_seq"
        snapshot = (
            f"  INSERT INTO `{revision_table}` (pov_id, version, snapshot, created_by, created_at)\n"
            f"    SELECT pov_id, version, PARSE_JSON(@snapshot), @actor, CURRENT_TIMESTAMP()\n"
            f"    FROM `{pov_table}` WHERE pov_id = @pov_id;\n"
        )

    sql = f"""
DECLARE result INT64 DEFAULT 0;
BEGIN TRANSACTION;
UPDATE `{pov_table}` SET status = @target, seq = seq + 1, version = version + 1, updated_by = @actor,
  updated_at = CURRENT_TIMESTAMP(){sets}
  WHERE pov_id = @pov_id AND status = @from_status AND deleted_at IS NULL{gate};
IF @@row_count = 1 THEN
{snapshot}  INSERT INTO `{log_table}` ({LOG_COLUMNS})
    SELECT pov_id, seq, @op_id, @actor, 'delphina', 'pov', pov_id, 'status', @old_json, @new_json, 'all', CURRENT_TIMESTAMP()
    FROM `{pov_table}` WHERE pov_id = @pov_id;
  SET result = 1;
ELSEIF EXISTS (SELECT 1 FROM `{pov_table}` WHERE pov_id = @pov_id AND deleted_at IS NULL) THEN
  SET result = 2;
END IF;
IF result = 1 THEN COMMIT TRANSACTION; ELSE ROLLBACK TRANSACTION; END IF;
SELECT result AS result;
"""
    return sql, params
