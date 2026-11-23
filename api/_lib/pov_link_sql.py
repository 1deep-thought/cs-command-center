"""Transaction scripts for criterion <-> pain point links (pure SQL builders, no BigQuery imports).

Same shape as pov_item_sql: bump the PoV counter (gate: draft/collaborating), change the link,
write one change-log row, commit only on success. Links are a set, so both operations are
idempotent and need no version: asking for the state that already holds is a success.
Result codes: 1 applied, 0 PoV missing or plan frozen, 4 already in the requested state,
6 the criterion or the pain point does not exist in this PoV.
"""

from __future__ import annotations

from typing import Literal

from .pov_item_sql import LOG_COLUMNS, Param

LinkMode = Literal["add", "remove"]


def build_link_script(
    mode: LinkMode,
    *,
    pov_table: str,
    link_table: str,
    criterion_table: str,
    pain_point_table: str,
    log_table: str,
    pov_id: str,
    criterion_id: str,
    pain_point_id: str,
    actor: str,
    op_id: str,
) -> tuple[str, list[Param]]:
    params = [
        Param("pov_id", "STRING", pov_id),
        Param("criterion_id", "STRING", criterion_id),
        Param("pain_point_id", "STRING", pain_point_id),
        Param("actor", "STRING", actor),
        Param("op_id", "STRING", op_id),
        Param("field", "STRING", "link_added" if mode == "add" else "link_removed"),
    ]
    live_link = (
        f"SELECT 1 FROM `{link_table}` WHERE pov_id = @pov_id AND criterion_id = @criterion_id "
        "AND pain_point_id = @pain_point_id AND deleted_at IS NULL"
    )
    if mode == "add":
        child = f"""INSERT INTO `{link_table}` (pov_id, criterion_id, pain_point_id, created_at)
    SELECT @pov_id, @criterion_id, @pain_point_id, CURRENT_TIMESTAMP() FROM UNNEST([1])
    WHERE EXISTS (SELECT 1 FROM `{criterion_table}` WHERE criterion_id = @criterion_id AND pov_id = @pov_id AND deleted_at IS NULL)
      AND EXISTS (SELECT 1 FROM `{pain_point_table}` WHERE pain_point_id = @pain_point_id AND pov_id = @pov_id AND deleted_at IS NULL)
      AND NOT EXISTS ({live_link});"""
        failure = f"IF(EXISTS({live_link}), 4, 6)"
    else:
        child = f"""UPDATE `{link_table}` SET deleted_at = CURRENT_TIMESTAMP()
    WHERE pov_id = @pov_id AND criterion_id = @criterion_id AND pain_point_id = @pain_point_id AND deleted_at IS NULL;"""
        failure = "4"

    sql = f"""
DECLARE result INT64 DEFAULT 0;
BEGIN TRANSACTION;
UPDATE `{pov_table}` SET seq = seq + 1, updated_by = @actor, updated_at = CURRENT_TIMESTAMP()
  WHERE pov_id = @pov_id AND status IN ('draft', 'collaborating') AND deleted_at IS NULL;
IF @@row_count = 1 THEN
  {child}
  IF @@row_count >= 1 THEN
    INSERT INTO `{log_table}` ({LOG_COLUMNS})
      SELECT p.pov_id, p.seq, @op_id, @actor, 'delphina', 'criterion_link', @criterion_id, @field, NULL, @pain_point_id, 'all', CURRENT_TIMESTAMP()
      FROM `{pov_table}` p WHERE p.pov_id = @pov_id;
    SET result = 1;
  ELSE
    SET result = {failure};
  END IF;
END IF;
IF result = 1 THEN COMMIT TRANSACTION; ELSE ROLLBACK TRANSACTION; END IF;
SELECT result AS result;
"""
    return sql, params
