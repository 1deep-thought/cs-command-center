"""BigQuery implementation of PovRepo (dataset cs_pov).

Rules: parameterized SQL only; table names come from a fixed allowlist; explicit column
lists (never SELECT *); every single-PoV query filters on pov_id (the cluster key).
Writes are multi-statement transactions that check the row version, so a stale
editor changes nothing. BigQuery applies conflict control per table, so concurrent writers (even to
different PoVs) can abort each other; those are retried with growing jittered backoff
inside the 10s serverless budget. Not yet load-tested under true concurrency.
"""

from __future__ import annotations

import json
import random
import time
from datetime import date
from typing import Any
from uuid import UUID

from google.cloud import bigquery

from .pov_bigquery import get_pov_client, pov_table
from .pov_models import PATCHABLE_FIELDS, PovCreate, PovListItem, PovOwnerView

BUDGET_S = 8.0  # reads: one deadline for the whole request (every query + retry), under the 10s guardrail
# Writes are multi-statement BigQuery transactions; measured ~6.7s for one item write (6 child jobs),
# so a write request gets a longer deadline. vercel.json raises the function limit to match.
WRITE_BUDGET_S = 20.0
MAX_ATTEMPTS = 3
RETRY_MARKERS = ("concurrent update", "aborted", "could not serialize")

POV_COLUMNS = (
    "pov_id, title, prospect_name, prospect_domain, status, decision, currency, start_date, "
    "end_date, baseline_end_date, go_threshold, no_go_threshold, owner_email, account_id, "
    "seq, version, created_by, created_at, updated_by, updated_at"
)
LIST_COLUMNS = "pov_id, title, prospect_name, status, decision, currency, end_date, owner_email, version, updated_at"
LOG_COLUMNS = (
    "pov_id, seq, op_id, actor, actor_kind, item_kind, item_id, field, old_value, new_value, visibility, changed_at"
)

FIELD_TYPES: dict[str, str] = {
    "title": "STRING",
    "prospect_name": "STRING",
    "prospect_domain": "STRING",
    "account_id": "STRING",
    "start_date": "DATE",
    "end_date": "DATE",
    "go_threshold": "INT64",
    "no_go_threshold": "INT64",
}
assert set(FIELD_TYPES) == set(PATCHABLE_FIELDS)  # a new patchable field needs a column type


def _param(name: str, type_: str, value: Any) -> bigquery.ScalarQueryParameter:
    return bigquery.ScalarQueryParameter(name, type_, value)


def _json(values: dict[str, object]) -> str:
    return json.dumps(values, default=lambda v: v.isoformat() if isinstance(v, date) else str(v), sort_keys=True)


def build_patch_script(changes: dict[str, object]) -> tuple[str, list[bigquery.ScalarQueryParameter]]:
    """Versioned UPDATE + change-log insert in one transaction. Column names come only from
    FIELD_TYPES, never from the request."""
    unknown = set(changes) - set(FIELD_TYPES)
    if unknown or not changes:
        raise ValueError(f"cannot patch: {sorted(unknown) or 'no fields'}")
    fields = sorted(changes)
    sets = ", ".join(f"{f} = @v_{f}" for f in fields)
    pov, log = pov_table("pov"), pov_table("pov_change_log")
    sql = f"""
DECLARE n INT64 DEFAULT 0;
BEGIN TRANSACTION;
UPDATE `{pov}` SET {sets}, version = version + 1, seq = seq + 1, updated_by = @actor, updated_at = CURRENT_TIMESTAMP()
WHERE pov_id = @pov_id AND version = @base_version AND deleted_at IS NULL;
SET n = @@row_count;
IF n = 1 THEN
  INSERT INTO `{log}` ({LOG_COLUMNS})
  SELECT pov_id, seq, @op_id, @actor, 'delphina', 'pov', pov_id, @fields, @old_json, @new_json, 'all', CURRENT_TIMESTAMP()
  FROM `{pov}` WHERE pov_id = @pov_id;
END IF;
COMMIT TRANSACTION;
SELECT n AS rows_changed;
"""
    params = [_param(f"v_{f}", FIELD_TYPES[f], changes[f]) for f in fields]
    return sql, params


class BigQueryPovRepo:
    def __init__(self) -> None:
        # One instance per request (see get_repo), so this is the request's deadline.
        self._client = get_pov_client()
        self._deadline = time.monotonic() + BUDGET_S

    # -- plumbing ------------------------------------------------------------------

    def _run(self, sql: str, params: list[bigquery.ScalarQueryParameter], *, retry: bool = False):
        if retry:  # retry=True marks a write: it and the read-back after it share the longer deadline
            self._deadline = max(self._deadline, time.monotonic() + WRITE_BUDGET_S)
        attempt = 0
        while True:
            attempt += 1
            remaining = self._deadline - time.monotonic()
            if remaining <= 0.5:
                raise TimeoutError("PoV request budget exhausted")
            try:
                job = self._client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
                return list(job.result(timeout=remaining))
            except Exception as exc:
                transient = any(m in str(exc).lower() for m in RETRY_MARKERS)
                if not (retry and transient) or attempt >= MAX_ATTEMPTS:
                    raise
                time.sleep(random.uniform(0.2, 0.8) * attempt)  # backoff grows; jitter spreads twins apart

    # -- reads ---------------------------------------------------------------------

    def get(self, pov_id: str) -> PovOwnerView | None:
        rows = self._run(
            f"SELECT {POV_COLUMNS} FROM `{pov_table('pov')}` WHERE pov_id = @pov_id AND deleted_at IS NULL LIMIT 1",
            [_param("pov_id", "STRING", pov_id)],
        )
        return PovOwnerView(**dict(rows[0].items())) if rows else None

    def list(self) -> list[PovListItem]:
        # Delphina staff see every PoV; the table is small. Capped, newest first.
        rows = self._run(
            f"SELECT {LIST_COLUMNS} FROM `{pov_table('pov')}` WHERE deleted_at IS NULL "
            "ORDER BY updated_at DESC LIMIT 200",
            [],
        )
        return [PovListItem(**dict(r.items())) for r in rows]

    def op_applied(self, pov_id: str, op_id: UUID, item_kind: str | None = None, item_id: str | None = None) -> bool:
        """Was this operation already logged? With item_kind/item_id it must have been applied to that item,
        so a client that reuses an op_id on another item is not silently ignored."""
        rows = self._run(
            f"SELECT 1 AS applied FROM `{pov_table('pov_change_log')}` "
            "WHERE pov_id = @pov_id AND op_id = @op_id "
            "AND (@item_kind IS NULL OR (item_kind = @item_kind AND item_id = @item_id)) "
            "AND changed_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY) LIMIT 1",
            [
                _param("pov_id", "STRING", pov_id),
                _param("op_id", "STRING", str(op_id)),
                _param("item_kind", "STRING", item_kind),
                _param("item_id", "STRING", item_id),
            ],
        )
        return bool(rows)

    # -- writes --------------------------------------------------------------------

    def insert(self, pov_id: str, data: PovCreate, owner_email: str) -> None:
        pov, log = pov_table("pov"), pov_table("pov_change_log")
        sql = f"""
BEGIN TRANSACTION;
INSERT INTO `{pov}` (pov_id, title, prospect_name, prospect_domain, status, currency, start_date, end_date,
  owner_email, account_id, seq, version, created_by, created_at, updated_by, updated_at)
VALUES (@pov_id, @title, @prospect_name, @prospect_domain, 'draft', @currency, @start_date, @end_date,
  @owner_email, @account_id, 1, 1, @owner_email, CURRENT_TIMESTAMP(), @owner_email, CURRENT_TIMESTAMP());
INSERT INTO `{log}` ({LOG_COLUMNS})
VALUES (@pov_id, 1, @op_id, @owner_email, 'delphina', 'pov', @pov_id, 'created', NULL, NULL, 'all', CURRENT_TIMESTAMP());
COMMIT TRANSACTION;
"""
        self._run(
            sql,
            [
                _param("pov_id", "STRING", pov_id),
                _param("op_id", "STRING", f"create-{pov_id}"),
                _param("title", "STRING", data.title),
                _param("prospect_name", "STRING", data.prospect_name),
                _param("prospect_domain", "STRING", data.prospect_domain),
                _param("currency", "STRING", data.currency),
                _param("start_date", "DATE", data.start_date),
                _param("end_date", "DATE", data.end_date),
                _param("owner_email", "STRING", owner_email),
                _param("account_id", "STRING", data.account_id),
            ],
            retry=True,
        )

    def apply_patch(
        self,
        pov_id: str,
        *,
        base_version: int,
        op_id: UUID,
        actor: str,
        changes: dict[str, object],
        old: dict[str, object],
    ) -> bool:
        sql, params = build_patch_script(changes)
        params += [
            _param("pov_id", "STRING", pov_id),
            _param("base_version", "INT64", base_version),
            _param("actor", "STRING", actor),
            _param("op_id", "STRING", str(op_id)),
            _param("fields", "STRING", ",".join(sorted(changes))),
            _param("old_json", "STRING", _json(old)),
            _param("new_json", "STRING", _json(changes)),
        ]
        rows = self._run(sql, params, retry=True)
        return bool(rows) and rows[0]["rows_changed"] == 1
