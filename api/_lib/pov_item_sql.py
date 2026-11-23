"""Pure SQL builder for child-item writes (no BigQuery imports, so it unit-tests anywhere).

One script = one transaction:
  1. bump the PoV's change counter (also the gate: the plan must be in draft/collaborating),
  2. apply the child statement with its version check, count limit or soft delete,
  3. write ONE change-log row stamped with the new counter value,
  4. commit only if everything applied.
Result codes: 1 applied, 0 PoV missing or plan frozen, 2 stale version, 3 item limit reached,
4 create of an id that already exists (live or soft-deleted), 5 a live item with the same
unique value (e.g. a second milestone of the same kind).

Every edit bumps the PoV's `seq`, which gives one gap-free sequence per PoV for "changes since
you looked" polling. BigQuery applies conflict control per TABLE, so concurrent writers to
different PoVs can also abort each other; the repo retries those (see pov_repo.MAX_ATTEMPTS).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from .pov_item_specs import ItemSpec

Mode = Literal["create", "update", "delete"]
LOG_COLUMNS = (
    "pov_id, seq, op_id, actor, actor_kind, item_kind, item_id, field, old_value, new_value, visibility, changed_at"
)
NO_LIMIT = 1_000_000


@dataclass(frozen=True)
class Param:
    name: str
    type: str  # BigQuery type, or "ARRAY<STRING>"
    value: Any


def build_write_script(
    spec: ItemSpec,
    mode: Mode,
    *,
    pov_table: str,
    item_table: str,
    log_table: str,
    pov_id: str,
    item_id: str,
    actor: str,
    op_id: str,
    values: dict[str, Any],
    old_json: str,
    new_json: str,
    base_version: int | None = None,
    cascade_tables: dict[str, str] | None = None,
) -> tuple[str, list[Param]]:
    fields = sorted(values)
    unknown = set(fields) - set(spec.fields)
    if unknown:
        raise ValueError(f"unknown {spec.kind} fields: {sorted(unknown)}")
    if mode == "update" and not fields:
        raise ValueError("update needs at least one field")
    if mode in ("update", "delete") and base_version is None:
        raise ValueError("update/delete need base_version")

    params = [
        Param("pov_id", "STRING", pov_id),
        Param("item_id", "STRING", item_id),
        Param("actor", "STRING", actor),
        Param("op_id", "STRING", op_id),
        Param("item_kind", "STRING", spec.kind),
        Param("fields", "STRING", "deleted" if mode == "delete" else ",".join(fields)),
        Param("old_json", "STRING", old_json),
        Param("new_json", "STRING", new_json),
    ]
    params += [Param(f"v_{f}", spec.fields[f], values[f]) for f in fields]

    live = "pov_id = @pov_id AND deleted_at IS NULL"
    if mode == "create":
        cols = [spec.id_column, "pov_id", *fields]
        vals = ["@item_id", "@pov_id", *[f"@v_{f}" for f in fields]]
        if spec.ordered:
            cols.append("position")
            vals.append(f"COALESCE((SELECT MAX(position) FROM `{item_table}` WHERE {live}), 0) + 1")
        if spec.actor_columns:
            cols += ["version", "created_by", "created_at", "updated_by", "updated_at"]
            vals += ["1", "@actor", "CURRENT_TIMESTAMP()", "@actor", "CURRENT_TIMESTAMP()"]
        else:
            cols += ["version", "created_at", "updated_at"]
            vals += ["1", "CURRENT_TIMESTAMP()", "CURRENT_TIMESTAMP()"]
        unique = ""
        if spec.unique_field:
            uf = spec.unique_field
            unique = f"\n  AND NOT EXISTS (SELECT 1 FROM `{item_table}` WHERE {live} AND {uf} = @v_{uf})"
        child = (
            f"INSERT INTO `{item_table}` ({', '.join(cols)})\n"
            f"  SELECT {', '.join(vals)} FROM UNNEST([1])\n"
            f"  WHERE (SELECT COUNT(1) FROM `{item_table}` WHERE {live}) < @max_items\n"
            f"  AND NOT EXISTS (SELECT 1 FROM `{item_table}` WHERE {spec.id_column} = @item_id AND pov_id = @pov_id)"
            f"{unique};"
        )
        params.append(Param("max_items", "INT64", spec.max_items or NO_LIMIT))
        # Checked first so a twin of the last allowed create reads as "already applied", not "full".
        other = 3
        if spec.unique_field:
            uf = spec.unique_field
            other = f"IF(EXISTS(SELECT 1 FROM `{item_table}` WHERE {live} AND {uf} = @v_{uf}), 5, 3)"
        failure = (
            f"IF(EXISTS(SELECT 1 FROM `{item_table}` WHERE {spec.id_column} = @item_id AND pov_id = @pov_id), 4, {other})"
        )
    else:
        sets = (
            "deleted_at = CURRENT_TIMESTAMP()"
            if mode == "delete"
            else ", ".join(f"{f} = @v_{f}" for f in fields)
        )
        actor_set = ", updated_by = @actor" if spec.actor_columns else ""
        child = (
            f"UPDATE `{item_table}` SET {sets}, version = version + 1{actor_set}, "
            "updated_at = CURRENT_TIMESTAMP()\n"
            f"  WHERE {spec.id_column} = @item_id AND {live} AND version = @base_version;"
        )
        params.append(Param("base_version", "INT64", base_version))
        failure = 2

    cascade = ""
    if mode == "delete":
        for table_key, column in spec.cascade:
            qualified = (cascade_tables or {}).get(table_key)
            if qualified is None:
                raise ValueError(f"cascade table {table_key} not provided")
            cascade += (
                f"    UPDATE `{qualified}` SET deleted_at = CURRENT_TIMESTAMP()\n"
                f"      WHERE pov_id = @pov_id AND {column} = @item_id AND deleted_at IS NULL;\n"
            )

    sql = f"""
DECLARE result INT64 DEFAULT 0;
BEGIN TRANSACTION;
UPDATE `{pov_table}` SET seq = seq + 1, updated_by = @actor, updated_at = CURRENT_TIMESTAMP()
  WHERE pov_id = @pov_id AND status IN ('draft', 'collaborating') AND deleted_at IS NULL;
IF @@row_count = 1 THEN
  {child}
  IF @@row_count = 1 THEN
{cascade}    INSERT INTO `{log_table}` ({LOG_COLUMNS})
      SELECT p.pov_id, p.seq, @op_id, @actor, 'delphina', @item_kind, @item_id, @fields, @old_json, @new_json, 'all', CURRENT_TIMESTAMP()
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
