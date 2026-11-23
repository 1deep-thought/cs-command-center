"""Account book and Account 360 data, read from the cs_analytics views in BigQuery.

Ported from the cs-analytics app (app.py) so the Renewals tab here behaves the same: the same
queries, run in parallel, cached for five minutes (the marts rebuild daily).

Credentials, in order:
1. Workload Identity Federation (no key file): Vercel's per-request OIDC token is exchanged for
   the read-only `cs-app-reader` service account. Needs GCP_WIF_AUDIENCE and
   GCP_SERVICE_ACCOUNT_EMAIL, and the identity pool must accept this Vercel project.
2. GOOGLE_APPLICATION_CREDENTIALS_JSON: a service-account key, for local use.
Neither configured: `configured()` is false and the routes answer 503. The PoV credentials are
never used here: that service account can write, and this code only ever reads.
"""

from __future__ import annotations

import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "rosy-pivot-169701")
DATASET = os.environ.get("CS_ANALYTICS_DATASET", "cs_analytics")
if not re.fullmatch(r"[A-Za-z0-9_-]+", PROJECT_ID) or not re.fullmatch(r"[A-Za-z0-9_]+", DATASET):
    raise RuntimeError("GCP_PROJECT_ID / CS_ANALYTICS_DATASET must be plain identifiers")

WIF_AUDIENCE_ENV = "GCP_WIF_AUDIENCE"
SERVICE_ACCOUNT_ENV = "GCP_SERVICE_ACCOUNT_EMAIL"
KEY_ENV = "GOOGLE_APPLICATION_CREDENTIALS_JSON"
OIDC_HEADER = "x-vercel-oidc-token"

CACHE_SECONDS = int(os.environ.get("CACHE_SECONDS", "300"))
QUERY_TIMEOUT_S = 25.0  # the function limit is 30s; the queries run in parallel
MAX_BYTES_BILLED = 10**9

_cache: dict[tuple[str, str | None], tuple[float, list[dict[str, Any]]]] = {}


def configured() -> bool:
    wif = bool(os.environ.get(WIF_AUDIENCE_ENV) and os.environ.get(SERVICE_ACCOUNT_ENV))
    return wif or bool(os.environ.get(KEY_ENV))


def get_client(oidc_token: str | None):
    """A read-only BigQuery client for this request. Imports are lazy so importing the app
    never needs the Google stack."""
    from google.cloud import bigquery

    audience = os.environ.get(WIF_AUDIENCE_ENV)
    account = os.environ.get(SERVICE_ACCOUNT_ENV)
    token = oidc_token or os.environ.get("VERCEL_OIDC_TOKEN")
    if token and audience and account:
        from google.auth import identity_pool

        class _VercelToken(identity_pool.SubjectTokenSupplier):
            def get_subject_token(self, context, request):
                return token

        creds = identity_pool.Credentials(
            audience=audience,
            subject_token_type="urn:ietf:params:oauth:token-type:jwt",
            token_url="https://sts.googleapis.com/v1/token",
            subject_token_supplier=_VercelToken(),
            service_account_impersonation_url=(
                f"https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{account}:generateAccessToken"
            ),
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        return bigquery.Client(project=PROJECT_ID, credentials=creds)
    raw = os.environ.get(KEY_ENV)
    if raw:
        from google.oauth2 import service_account

        info = json.loads(raw)
        return bigquery.Client(project=PROJECT_ID, credentials=service_account.Credentials.from_service_account_info(info))
    raise RuntimeError("no BigQuery credentials for cs_analytics")


def run(client, sql: str, account_id: str | None = None) -> list[dict[str, Any]]:
    key = (sql, account_id)
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    from google.cloud import bigquery

    params = [bigquery.ScalarQueryParameter("account_id", "STRING", account_id)] if account_id else []
    cfg = bigquery.QueryJobConfig(maximum_bytes_billed=MAX_BYTES_BILLED, query_parameters=params)
    rows = [dict(row) for row in client.query(sql, job_config=cfg).result(timeout=QUERY_TIMEOUT_S)]
    _cache[key] = (time.monotonic(), rows)
    return rows


def run_many(client, queries: dict[str, str], account_id: str | None = None) -> dict[str, list[dict[str, Any]]]:
    """Run independent queries in parallel; return {name: rows}."""
    with ThreadPoolExecutor(max_workers=len(queries)) as pool:
        futures = {name: pool.submit(run, client, sql, account_id) for name, sql in queries.items()}
        return {name: future.result() for name, future in futures.items()}


T = f"`{PROJECT_ID}.{DATASET}`"

# Explicit columns; account_book is a small view with one row per account.
BOOK_SQL = f"""
SELECT b.account_id, b.account_name, b.primary_domain, b.industry, b.segment, b.plan_tier,
       b.employee_count, b.lifecycle_stage, b.csm_owner_email, b.ae_owner_email, b.renewal_owner_email,
       b.health_score, b.health_score_uncapped, b.health_band, b.health_guardrails,
       b.health_usage_score, b.health_engagement_score, b.health_support_score,
       b.arr_usd, b.arr_change_30d_usd, b.next_renewal_date, b.days_to_renewal,
       b.seat_utilization, b.active_users_30d, b.licensed_seats, b.chats_30d, b.chats_30d_delta_pct,
       b.open_tickets, b.open_high_priority_tickets, b.days_since_last_touch,
       b.red_signals, b.amber_signals, b.data_gaps, b.data_completeness, b.urgency_score,
       b.snapshot_date, r.renewal_stage, r.forecast_category
FROM {T}.account_book b
LEFT JOIN {T}.renewals r
  ON r.account_id = b.account_id AND r.renewal_date = b.next_renewal_date
QUALIFY ROW_NUMBER() OVER (PARTITION BY b.account_id ORDER BY r.arr_usd DESC) = 1
ORDER BY b.urgency_score DESC, b.arr_usd DESC
"""

ALL_SIGNALS_SQL = f"""
SELECT account_id, signal_id, label, severity, detail
FROM {T}.account_signals
ORDER BY account_id, IF(severity = 'red', 0, 1), label
"""

FRESHNESS_SQL = f"SELECT source, last_successful_sync_at, status FROM {T}.source_freshness ORDER BY source"

WHERE_ACCT = "WHERE account_id = @account_id"
LATEST_COMPONENTS = f"(SELECT MAX(snapshot_date) FROM {T}.account_health_components {WHERE_ACCT})"

# The hero needs the account's own row. Same columns as the book, plus the few only the 360 shows.
DETAIL_BOOK_COLUMNS = (
    "account_id, account_name, primary_domain, industry, segment, plan_tier, employee_count, lifecycle_stage, "
    "csm_owner_email, ae_owner_email, renewal_owner_email, health_score, health_score_uncapped, health_band, "
    "health_guardrails, arr_usd, arr_change_30d_usd, next_renewal_date, days_to_renewal, seat_utilization, "
    "active_users_30d, licensed_seats, chats_30d, chats_30d_delta_pct, success_rate_30d, open_tickets, "
    "open_high_priority_tickets, last_csm_touch_at, last_product_activity_at, telemetry_level"
)

DETAIL_SQL = {
    "book": f"SELECT {DETAIL_BOOK_COLUMNS} FROM {T}.account_book {WHERE_ACCT}",
    "signals": f"""SELECT signal_id, label, severity, detail, play FROM {T}.account_signals {WHERE_ACCT}
                   ORDER BY IF(severity = 'red', 0, 1), label""",
    "components": f"""SELECT component, metric, metric_label, value, score, weight, contribution_points,
                             points_available, improve_hint
                      FROM {T}.account_health_components
                      {WHERE_ACCT} AND snapshot_date = {LATEST_COMPONENTS}
                      ORDER BY component, points_available DESC""",
    "health_trend": f"""SELECT snapshot_date, health_score, health_score_uncapped, health_band
                        FROM {T}.account_health_daily {WHERE_ACCT}
                          AND snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 185 DAY)
                        ORDER BY snapshot_date""",
    "usage": f"""SELECT activity_date, dau, wau, mau, chats, success_rate, thumbs_up, thumbs_down,
                        slack_chats, mcp_chats, research_runs, workflow_runs, knowledge_edits
                 FROM {T}.account_usage_daily {WHERE_ACCT}
                   AND activity_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 185 DAY)
                 ORDER BY activity_date""",
    "domains": f"""SELECT instance_id, environment, domain_name, item_count, approved_item_count, coverage_pct,
                          validation_match_pct, eval_pass_rate, open_gaps, open_inbox_issues,
                          tables_in_warehouse, tables_documented, edits_7d, last_edit_at, readiness
                   FROM {T}.account_domain_readiness {WHERE_ACCT}
                   ORDER BY CASE readiness WHEN 'at_risk' THEN 0 WHEN 'needs_work' THEN 1 ELSE 2 END, domain_name""",
    "deals": f"""SELECT deal_id, dealname, stage, dealtype, is_open, arr_usd, close_date, contract_start_date,
                        contract_end_date, forecast_category, owner_email, contract_status, hubspot_url
                 FROM {T}.account_deals {WHERE_ACCT} ORDER BY is_open DESC, close_date DESC""",
    "gaps": f"""SELECT check_id, check_label, status, fix_hint, hubspot_url
                FROM {T}.account_data_gaps {WHERE_ACCT}
                ORDER BY CASE status WHEN 'fail' THEN 0 WHEN 'pass' THEN 1 ELSE 2 END, check_label""",
    "people": f"""SELECT name, title, contact_role, last_call_at, last_ticket_at, chats_30d, last_product_activity_at
                  FROM {T}.people_engagement {WHERE_ACCT}
                  ORDER BY name IS NULL,
                    CASE contact_role WHEN 'exec_sponsor' THEN 0 WHEN 'decision_maker' THEN 1 WHEN 'champion' THEN 2
                                      WHEN 'unknown' THEN 9 ELSE 5 END,
                    chats_30d DESC LIMIT 25""",
    "calls": f"""SELECT call_started_at, title, summary, sentiment, themes, competitor_mentions, source_url
                 FROM {T}.call_insights {WHERE_ACCT} ORDER BY call_started_at DESC LIMIT 6""",
    "timeline": f"""SELECT event_at, source, event_type, title, internal_owner_email, source_url
                    FROM {T}.account_timeline {WHERE_ACCT} ORDER BY event_at DESC LIMIT 30""",
    "arr": f"""SELECT movement_date, movement_type, arr_before_usd, arr_after_usd, delta_usd
               FROM {T}.arr_movements {WHERE_ACCT} ORDER BY movement_date""",
}


def fetch_book(client) -> dict[str, Any]:
    res = run_many(client, {"book": BOOK_SQL, "signals": ALL_SIGNALS_SQL, "freshness": FRESHNESS_SQL})
    by_account: dict[str, list[dict[str, Any]]] = {}
    for signal in res["signals"]:  # cached rows are shared: build new dicts, never mutate
        by_account.setdefault(signal["account_id"], []).append({k: v for k, v in signal.items() if k != "account_id"})
    accounts = [{**a, "signals": by_account.get(a["account_id"], [])} for a in res["book"]]
    return {"accounts": accounts, "freshness": res["freshness"]}


def fetch_account(client, account_id: str) -> dict[str, Any] | None:
    """Everything the Account 360 shows, or None when there is no such account."""
    res: dict[str, Any] = run_many(client, DETAIL_SQL, account_id)
    if not res["book"]:
        return None
    return {**res, "book": res["book"][0]}
