"""BigQuery implementation of ItemRepo. Reuses BigQueryPovRepo's client, deadline and retry."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal

from google.cloud import bigquery

from .pov_bigquery import pov_table
from .pov_item_specs import ItemSpec
from .pov_item_sql import Param, build_write_script
from .pov_repo import BigQueryPovRepo, _json, _param


NUMERIC_SCALE = Decimal("1e-9")  # BigQuery NUMERIC keeps 9 decimal places


def _to_query_param(p: Param):
    if p.type.startswith("ARRAY<"):
        return bigquery.ArrayQueryParameter(p.name, p.type[6:-1], p.value)
    value: Any = (
        Decimal(str(p.value)).quantize(NUMERIC_SCALE) if p.type == "NUMERIC" and p.value is not None else p.value
    )
    return _param(p.name, p.type, value)


class BigQueryItemRepo(BigQueryPovRepo):
    def get_pov(self, pov_id: str):
        return self.get(pov_id)

    def list_items(self, spec: ItemSpec, pov_id: str) -> list[dict[str, object]]:
        order = "position, created_at" if spec.ordered else "created_at"
        rows = self._run(
            f"SELECT {spec.select_columns} FROM `{pov_table(spec.table)}` "
            f"WHERE pov_id = @pov_id AND deleted_at IS NULL ORDER BY {order} LIMIT 100",
            [_param("pov_id", "STRING", pov_id)],
        )
        return [dict(r.items()) for r in rows]

    def get_item(self, spec: ItemSpec, pov_id: str, item_id: str) -> dict[str, object] | None:
        rows = self._run(
            f"SELECT {spec.select_columns} FROM `{pov_table(spec.table)}` "
            f"WHERE pov_id = @pov_id AND {spec.id_column} = @item_id AND deleted_at IS NULL LIMIT 1",
            [_param("pov_id", "STRING", pov_id), _param("item_id", "STRING", item_id)],
        )
        return dict(rows[0].items()) if rows else None

    def write_item(
        self,
        spec: ItemSpec,
        mode: Literal["create", "update", "delete"],
        *,
        pov_id: str,
        item_id: str,
        actor: str,
        op_id: str,
        values: dict[str, object],
        old: dict[str, object],
        base_version: int | None,
    ) -> int:
        sql, params = build_write_script(
            spec,
            mode,
            pov_table=pov_table("pov"),
            item_table=pov_table(spec.table),
            log_table=pov_table("pov_change_log"),
            pov_id=pov_id,
            item_id=item_id,
            actor=actor,
            op_id=op_id,
            values=values,
            old_json=_json(old),
            new_json=_json(values),
            base_version=base_version,
        )
        rows = self._run(sql, [_to_query_param(p) for p in params], retry=True)
        if not rows:
            raise RuntimeError("item write returned no result")
        return int(rows[0]["result"])
