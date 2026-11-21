"""BigQuery → AccountInputs.

One query, aggregated in SQL; Python only applies the scoring formula.

ASSUMED SCHEMA (pending @data-architect review — see docs/specs/health-renewals.md):
  hubspot_companies        account_id, name, plan, owner_id, owner_name, arr, licensed_seats,
                           contract_end_date, created_date
  hubspot_renewal_deals    account_id, close_date, is_closed               (open Renewal-pipeline deals)
  hubspot_tickets          ticket_id, account_id, priority, is_open, created_date
  telemetry_accounts       account_id, first_active_date                   (entity map)
  telemetry_user_days      activity_date [PARTITION], account_id [CLUSTER], user_id
                           (one row per qualifying active user-day; internal/service users excluded upstream)
  telemetry_feature_usage  activity_date [PARTITION], account_id [CLUSTER], feature, user_id
  gong_calls               call_date [PARTITION], account_id [CLUSTER], call_id, url,
                           is_customer_call, has_exec_participant
  gong_call_trackers       call_date [PARTITION], account_id [CLUSTER], call_id, tracker
  wisdom_questions         asked_date [PARTITION], account_id [CLUSTER], is_unresolved
  health_snapshots         snapshot_date [PARTITION], account_id [CLUSTER], health_score,
                           health_band, arr_usd, seat_utilization_pct, days_since_customer_call
  gong_account_map         account_id                                      (domain-resolved accounts)
"""

from __future__ import annotations

from datetime import date, timedelta

from google.cloud import bigquery

from .bigquery import QUERY_TIMEOUT_S, dataset, get_client
from .config import KEY_FEATURES
from .inputs import AccountInputs
from .scoring import Windows

# Gong lookback for "last call" recency. Calls older than this read as "never",
# which scores identically (>90d → 0) and keeps the partition scan bounded.
GONG_LOOKBACK_DAYS = 365

SQL = """
DECLARE as_of DATE DEFAULT @as_of;

WITH companies AS (
  SELECT
    c.account_id, c.name, c.plan, c.owner_id, c.owner_name,
    CAST(c.arr AS FLOAT64) AS arr,
    NULLIF(c.licensed_seats, 0) AS licensed_seats,
    COALESCE(c.contract_end_date, d.close_date) AS renewal_date,
    d.account_id IS NOT NULL AS renewal_deal_open,
    DATE_DIFF(as_of, c.created_date, DAY) AS account_age_days
  FROM `{ds}.hubspot_companies` c
  LEFT JOIN (
    SELECT account_id, MIN(close_date) AS close_date
    FROM `{ds}.hubspot_renewal_deals`
    WHERE NOT is_closed
    GROUP BY account_id
  ) d USING (account_id)
  WHERE (@owner IS NULL OR c.owner_id = @owner)
),

-- Telemetry: last 60d of user-days (partition-filtered), aggregated per account.
user_days AS (
  SELECT account_id, activity_date, user_id
  FROM `{ds}.telemetry_user_days`
  WHERE activity_date BETWEEN @prior_start AND as_of
    AND account_id IN (SELECT account_id FROM companies)
),
usage AS (
  SELECT
    account_id,
    COUNTIF(activity_date >= @last_start) AS aud_last_30d,
    COUNTIF(activity_date < @last_start) AS aud_prior_30d
  FROM user_days
  GROUP BY account_id
),
wau AS (
  SELECT account_id, CAST(ROUND(AVG(weekly_users)) AS INT64) AS wau
  FROM (
    SELECT account_id, DATE_TRUNC(activity_date, ISOWEEK) AS wk, COUNT(DISTINCT user_id) AS weekly_users
    FROM user_days
    WHERE activity_date BETWEEN DATE_SUB(@wau_end, INTERVAL 27 DAY) AND @wau_end
    GROUP BY account_id, wk
  )
  GROUP BY account_id
),
key_features AS (
  SELECT kf.plan, kf.feature FROM UNNEST(@key_features) kf
),
feature_users AS (
  SELECT account_id, feature, COUNT(DISTINCT user_id) AS users
  FROM `{ds}.telemetry_feature_usage`
  WHERE activity_date BETWEEN @last_start AND as_of
    AND account_id IN (SELECT account_id FROM companies)
    AND feature IN (SELECT feature FROM key_features)
  GROUP BY account_id, feature
),
adoption AS (
  SELECT
    c.account_id,
    ARRAY_AGG(IF(COALESCE(fu.users, 0) >= GREATEST(3, 0.1 * COALESCE(w.wau, 0)), kf.feature, NULL)
              IGNORE NULLS ORDER BY kf.feature) AS adopted,
    ARRAY_AGG(IF(COALESCE(fu.users, 0) <  GREATEST(3, 0.1 * COALESCE(w.wau, 0)), kf.feature, NULL)
              IGNORE NULLS ORDER BY kf.feature) AS unadopted
  FROM companies c
  JOIN key_features kf ON kf.plan = c.plan
  LEFT JOIN wau w USING (account_id)
  LEFT JOIN feature_users fu ON fu.account_id = c.account_id AND fu.feature = kf.feature
  GROUP BY c.account_id
),

-- Gong
calls AS (
  SELECT account_id, call_id, call_date, url, has_exec_participant
  FROM `{ds}.gong_calls`
  WHERE call_date BETWEEN @gong_start AND as_of
    AND is_customer_call
    AND account_id IN (SELECT account_id FROM companies)
),
last_calls AS (
  SELECT
    account_id,
    ARRAY_AGG(STRUCT(call_date, call_id, url) ORDER BY call_date DESC LIMIT 1)[OFFSET(0)] AS last_call,
    ARRAY_AGG(IF(has_exec_participant, STRUCT(call_date, call_id, url), NULL)
              IGNORE NULLS ORDER BY call_date DESC LIMIT 1) AS last_exec
  FROM calls
  GROUP BY account_id
),
flagged AS (
  SELECT
    t.account_id,
    ARRAY_AGG(STRUCT(t.call_date, t.call_id, c.url, t.tracker) ORDER BY t.call_date DESC) AS calls
  FROM `{ds}.gong_call_trackers` t
  JOIN calls c USING (call_id)
  WHERE t.call_date BETWEEN DATE_SUB(as_of, INTERVAL 89 DAY) AND as_of
    AND t.tracker IN ('churn_intent', 'competitor', 'budget_pricing', 'renewal_hesitation')
  GROUP BY t.account_id
),

-- Support
tickets AS (
  SELECT account_id,
         ARRAY_AGG(STRUCT(ticket_id, priority, created_date AS opened_date) ORDER BY created_date) AS open_tickets
  FROM `{ds}.hubspot_tickets`
  WHERE is_open AND account_id IN (SELECT account_id FROM companies)
  GROUP BY account_id
),
wisdom AS (
  SELECT account_id, COUNT(*) AS questions, COUNTIF(is_unresolved) AS unresolved
  FROM `{ds}.wisdom_questions`
  WHERE asked_date BETWEEN @last_start AND as_of
    AND account_id IN (SELECT account_id FROM companies)
  GROUP BY account_id
),

snap AS (
  SELECT account_id, health_score, health_band, arr_usd, seat_utilization_pct, days_since_customer_call
  FROM `{ds}.health_snapshots`
  WHERE snapshot_date = DATE_SUB(as_of, INTERVAL 30 DAY)
    AND account_id IN (SELECT account_id FROM companies)
)

SELECT
  c.*,
  ta.account_id IS NOT NULL AS telemetry_mapped,
  COALESCE(DATE_DIFF(as_of, ta.first_active_date, DAY) + 1, 0) AS telemetry_history_days,
  w.wau,
  COALESCE(u.aud_last_30d, 0) AS aud_last_30d,
  COALESCE(u.aud_prior_30d, 0) AS aud_prior_30d,
  COALESCE(a.adopted, ARRAY<STRING>[]) AS adopted,
  COALESCE(a.unadopted, ARRAY<STRING>[]) AS unadopted,
  gm.account_id IS NOT NULL AS gong_mapped,
  lc.last_call,
  IF(ARRAY_LENGTH(lc.last_exec) > 0, lc.last_exec[OFFSET(0)], NULL) AS last_exec,
  IFNULL(f.calls, []) AS flagged_calls,
  IFNULL(t.open_tickets, []) AS open_tickets,
  COALESCE(wq.questions, 0) AS wisdom_questions,
  COALESCE(wq.unresolved, 0) AS wisdom_unresolved,
  s.health_score AS snap_score, s.health_band AS snap_band, s.arr_usd AS snap_arr,
  s.seat_utilization_pct AS snap_util, s.days_since_customer_call AS snap_call,
  s.account_id IS NOT NULL AS has_snapshot
FROM companies c
LEFT JOIN `{ds}.telemetry_accounts` ta USING (account_id)
LEFT JOIN `{ds}.gong_account_map` gm USING (account_id)
LEFT JOIN usage u USING (account_id)
LEFT JOIN wau w USING (account_id)
LEFT JOIN adoption a USING (account_id)
LEFT JOIN last_calls lc USING (account_id)
LEFT JOIN flagged f USING (account_id)
LEFT JOIN tickets t USING (account_id)
LEFT JOIN wisdom wq USING (account_id)
LEFT JOIN snap s USING (account_id)
"""


def _key_features_param() -> bigquery.ArrayQueryParameter:
    rows = [
        bigquery.StructQueryParameter(
            None,
            bigquery.ScalarQueryParameter("plan", "STRING", plan),
            bigquery.ScalarQueryParameter("feature", "STRING", feature),
        )
        for plan, features in KEY_FEATURES.items()
        for feature in features
    ]
    return bigquery.ArrayQueryParameter("key_features", "STRUCT", rows)


def fetch_account_inputs(as_of: date, owner: str | None) -> list[AccountInputs]:
    w = Windows(as_of)
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("as_of", "DATE", as_of),
            bigquery.ScalarQueryParameter("owner", "STRING", owner),
            bigquery.ScalarQueryParameter("last_start", "DATE", w.last_30d[0]),
            bigquery.ScalarQueryParameter("prior_start", "DATE", w.prior_30d[0]),
            bigquery.ScalarQueryParameter("wau_end", "DATE", w.wau_week_end),
            bigquery.ScalarQueryParameter(
                "gong_start", "DATE", as_of - timedelta(days=GONG_LOOKBACK_DAYS)
            ),
            _key_features_param(),
        ]
    )
    sql = SQL.format(ds=dataset())
    rows = get_client().query(sql, job_config=job_config).result(timeout=QUERY_TIMEOUT_S)
    return [_to_inputs(dict(r.items())) for r in rows]


def _call(v: dict[str, object] | None) -> dict[str, object] | None:
    return None if v is None else dict(v)


def _to_inputs(r: dict[str, object]) -> AccountInputs:
    snapshot = None
    if r["has_snapshot"]:
        snapshot = {
            "health_score": r["snap_score"],
            "health_band": r["snap_band"],
            "arr_usd": r["snap_arr"],
            "seat_utilization_pct": r["snap_util"],
            "days_since_customer_call": r["snap_call"],
        }
    return AccountInputs.model_validate(
        {
            "account_id": r["account_id"],
            "account_name": r["name"],
            "plan": r["plan"],
            "owner_id": r["owner_id"],
            "owner_name": r["owner_name"],
            "arr_usd": r["arr"] or 0.0,
            "renewal_date": r["renewal_date"],
            "renewal_deal_open": r["renewal_deal_open"],
            "account_age_days": r["account_age_days"],
            "telemetry_mapped": r["telemetry_mapped"],
            "telemetry_history_days": r["telemetry_history_days"],
            "wau": r["wau"],
            "licensed_seats": r["licensed_seats"],
            "active_user_days_last_30d": r["aud_last_30d"],
            "active_user_days_prior_30d": r["aud_prior_30d"],
            "key_features_adopted": r["adopted"],
            "key_features_unadopted": r["unadopted"],
            "gong_mapped": r["gong_mapped"],
            "last_customer_call": _call(r["last_call"]),  # type: ignore[arg-type]
            "last_exec_call": _call(r["last_exec"]),  # type: ignore[arg-type]
            "flagged_calls_90d": [dict(c) for c in r["flagged_calls"]],  # type: ignore[attr-defined]
            # Ticket sync health is tracked outside this query; assume available.
            "tickets_available": True,
            "open_tickets": [dict(t) for t in r["open_tickets"]],  # type: ignore[attr-defined]
            "wisdom_questions_30d": r["wisdom_questions"],
            "wisdom_unresolved_30d": r["wisdom_unresolved"],
            "snapshot_30d": snapshot,
        }
    )
