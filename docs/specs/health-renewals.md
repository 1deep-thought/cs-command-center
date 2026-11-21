# Spec: Customer Health & Renewals Dashboard

- **Owner:** `@cs-operator` (business logic). Next reviewers: `@data-architect` (SQL/entity resolution), `@product-designer` (layout/states), `@tech-lead` (contract).
- **Status:** Locked v1, 2026-11-20
- **Principle:** Every number on this page either changes what a CSM does today or changes the renewal forecast. If it does neither, it's not here.

---

## 0. Global conventions

| Term | Canonical definition |
|---|---|
| `as_of_date` | Last complete UTC day of data (normally yesterday). All windows anchor here. Today is 2026-11-20, so `as_of_date` = 2026-11-19. |
| `last_30d` | `as_of_date − 29d` .. `as_of_date` inclusive (2026-10-21..2026-11-19). |
| `prior_30d` | The 30 days immediately before `last_30d` (2026-09-21..2026-10-20). |
| ARR | HubSpot company property `arr` (current contracted recurring revenue, USD). Never recomputed from line items in this view. |
| Renewal date | HubSpot `contract_end_date` on the company. If missing, the close date of the open Renewal-pipeline deal. If both missing, the account is excluded from renewal windows and flagged `renewal_date_missing`. |
| Active user | Distinct customer user with ≥1 qualifying product session on a day. Excludes our internal domains, service/API accounts, and SSO health-check logins. A raw login event alone is not a session. |
| Active user-days | Sum over days of distinct active users per day. The usage-volume unit (stops one user's 40 logins from looking like 40 users). |
| WAU | Mean of distinct active users across the last 4 complete ISO weeks ending on or before `as_of_date`. |
| Licensed seats | HubSpot company property `licensed_seats`. `0` or null = missing. |
| Customer call | Gong call with ≥1 external participant whose email domain resolves to the account's `account_id`. Internal-only calls don't count. |
| Exec call | Customer call where ≥1 external participant's HubSpot contact title matches `(?i)\b(chief|c[eotfir]o|vp|vice president|svp|evp|head of|president|founder|general manager)\b`. |
| Snapshot | Health scores and component values are written once a day to a snapshot table. Every "Δ vs 30d ago" compares to the snapshot from `as_of_date − 30d`. |

---

## 1. Users, job-to-be-done, core questions

| User | When | Job-to-be-done |
|---|---|---|
| **CSM** (default filter: `owner = me`) | Morning triage, about 10 min | "Which of my renewing accounts need me today, and what do I do about it?" |
| **CS leader** (default filter: all owners) | Weekly forecast review / Monday pipeline call | "What's our gross renewal forecast for the next 90 days, how much ARR is at risk, and is anyone working it?" |

The page answers only these **3 questions**:

1. **How much ARR renews in the next 90 days, and what do we expect to keep?** (KPI strip)
2. **Which renewing accounts are at risk, in order of urgency?** (renewals table, default sort)
3. **Why is each one at risk, with evidence I can act on?** (risk drivers with source refs)

Anything that doesn't serve one of these goes to another view (the QBR or Account Detail page) or gets cut (see §5).

---

## 2. Account health score

### 2.1 Components and weights

Five components, each normalized to 0–100, weighted to a 0–100 score. Integer weights sum to 100.

| # | Component | Weight | Source | Measures |
|---|---|---|---|---|
| C1 | **Seat utilization** | **30** | Telemetry + HubSpot | Whether they're using what they pay for (the single best renewal predictor) |
| C2 | **Usage trend** | **20** | Telemetry | Direction of travel |
| C3 | **Relationship** | **20** | Gong | Whether we're in the room, and whether the room is unhappy |
| C4 | **Key feature adoption** | **15** | Telemetry | Depth/stickiness |
| C5 | **Support friction** | **15** | HubSpot tickets + WisdomAI | Unresolved pain |

### 2.2 Normalization rules (each clamped to [0, 100], rounded to integer)

**C1 Seat utilization**
- `u = WAU / licensed_seats`
- `score = min(100, round(100 × u / 0.70))`, so ≥70% utilization = 100, 35% = 50, 0% = 0.

**C2 Usage trend**
- `r = (active_user_days_last_30d − active_user_days_prior_30d) / active_user_days_prior_30d`
- Linear from r = −40% → 0 to r = +10% → 100: `score = clamp(round(80 + 200 × r), 0, 100)`. Flat (r = 0) = 80, since stable usage is healthy.
- `prior = 0, last > 0` → 100. `prior = 0, last = 0` → 0.

**C3 Relationship**
- Base, by days since last customer call (`d`): `d ≤ 30` → 100; `31–60` → 70; `61–90` → 40; `> 90` or never → 0.
- Penalty: −25 for each customer call in the last 90d flagged with a **risk mention** (see §4, driver `RISK_MENTION`). Max penalty −50. Floor 0.

**C4 Key feature adoption**
- Key features: a config list of exactly 3 product features per plan, owned by CS leadership (`key_features.yaml`, versioned). They are not hardcoded in SQL.
- A feature is "adopted" if, in `last_30d`, it was used by ≥ `max(3, 10% of WAU)` distinct active users.
- `score = round(100 × adopted_count / 3)`, which gives 0 / 33 / 67 / 100.

**C5 Support friction**
- Start at 100.
- −20 per open HubSpot ticket with priority High or Urgent (any age).
- −10 per other open ticket older than 14 days.
- If WisdomAI questions in `last_30d` ≥ 5: subtract `round(50 × unresolved_rate)`, where `unresolved_rate = unresolved_questions / total_questions`. "Unresolved" means WisdomAI marked the question unanswered, or the user gave negative feedback with no follow-up answer.
- Floor 0. If there are no tickets and fewer than 5 questions, the score is 100.

### 2.3 Composite and bands

```
health_score = round( Σ(weight_i × score_i) / Σ(weight_i) )   over AVAILABLE components only
```

| Band | Rule |
|---|---|
| **Healthy** | 70–100 |
| **Watch** | 50–69 |
| **At Risk** | 0–49 |
| **Insufficient data** | Available component weight < 60 → `health_score = null` |

**Hard override:** a `CHURN_INTENT` risk mention (see §4) on a customer call in the last 90d forces band = **At Risk** whatever the score. The numeric score still shows; `band_overridden = true`.

### 2.4 Null and edge cases (exhaustive)

A component that is **excluded** drops out of both the numerator and the denominator, so the remaining weights rescale proportionally. An excluded component is never scored as 0. Every exclusion adds an entry to `data_gaps`.

| Situation | Treatment | `data_gaps` code |
|---|---|---|
| Telemetry history < 30 days (first active day after `as_of_date − 30d`) | Exclude C1, C2, C4. Available weight = 35 → **Insufficient data**. | `telemetry_lt_30d` |
| Telemetry history 30–59 days | Exclude C2 only (no full prior window). Available = 80 → scored. | `telemetry_lt_60d` |
| `licensed_seats` null or 0 | Exclude C1. Available = 70 → scored. Shown as a HubSpot hygiene task for the owner. | `seat_count_missing` |
| WAU > licensed seats | C1 = 100 (capped). Not a risk. Surfaced as an **expansion signal** on Account Detail (out of scope here). | none |
| Account has no Gong mapping (domain unresolved) | Exclude C3. This is a data problem, not a customer signal. | `gong_unmapped` |
| Gong-mapped, zero customer calls in 90d, account age > 90d | C3 = 0. **Silence is a signal.** | none |
| Gong-mapped, zero customer calls, account age ≤ 90d | Exclude C3 (onboarding calls may go through Implementation, outside Gong). | `gong_new_account` |
| No telemetry mapping at all | Exclude C1, C2, C4 → **Insufficient data**. | `telemetry_unmapped` |
| WisdomAI not deployed / < 5 questions | C5 uses tickets only (no exclusion). | none |
| HubSpot ticket sync unavailable for the run | Exclude C5. | `tickets_unavailable` |
| No snapshot 30 days ago (new account or pipeline start) | `health_score_delta_30d = null`, shown as "—" with tooltip "New". Never shown as 0. | none |

Sanity check: an account with all five components available, no exclusions, uses the full 100 weight.

---

## 3. Renewals view

### 3.1 Windows

- **Default: "Next 90 days"** = `renewal_date` in `as_of_date + 1` .. `as_of_date + 90`, **plus past-due**: renewal date ≤ `as_of_date` with the renewal deal still open (shown pinned at top with a "Past due" tag).
- **Toggle: "91–180 days"** for early-warning work. There is no other window; we don't build a 12-month view here.
- Accounts whose renewal deal is Closed Won / Closed Lost leave the window the day it closes.

### 3.2 Columns (8)

| # | Column | Content | Comparison context |
|---|---|---|---|
| 1 | **Account** | Name, with plan + owner CSM as subtext | — |
| 2 | **ARR** | USD, compact ($148k) | Δ vs ARR 30d ago if it changed (e.g. "+$12k" after an upsell or "−$20k" after a downsell) |
| 3 | **Renewal** | Date + days out ("Jan 14 · 55d"); "Past due 6d" in red | — |
| 4 | **Health** | Score + band badge (or "Insufficient data" + gap reasons on hover) | Δ points vs 30d ago snapshot ("↓14") |
| 5 | **Seat utilization** | `WAU / seats` as % with count ("41% · 62/150") | Δ percentage points vs value 30d ago |
| 6 | **Usage trend** | `r` as signed % ("−32%") | Already a vs-prior-30d comparison by definition |
| 7 | **Last customer call** | Days ago ("74d"), with ★ if it was an exec call; "Never" if none | Exec call days-ago in tooltip |
| 8 | **Risk drivers** | Up to 3 driver chips (see §4), "+N" overflow | Each chip carries its own comparison and source ref |

Excluded components show "—", never 0 or NaN.

### 3.3 Default sort (deterministic)

1. Past-due first.
2. Band priority: At Risk → Watch → Insufficient data → Healthy.
3. Renewal date ascending.
4. ARR descending (tiebreak).

Insufficient data sorts above Healthy on purpose: we can't call it healthy, so a human has to look at it.

### 3.4 KPI summary strip (exactly 4)

All four are computed over the **selected window and owner filter**. Each shows a comparison against the same metric computed from the snapshot 30 days ago (same relative window).

| KPI | Definition | Comparison shown |
|---|---|---|
| **ARR renewing** | Σ ARR of accounts in the window (incl. past-due). Shows account count as subtext. | Δ $ vs 30d ago |
| **ARR at risk** | Σ ARR of accounts in the window with band = At Risk (incl. overrides). Shows % of ARR renewing as subtext. | Δ $ vs 30d ago |
| **Forecast GRR** | `Σ(ARR × p_band) / Σ ARR` over the window, where `p_band` is Healthy 0.95, Watch 0.80, Insufficient 0.80, At Risk 0.50. Shown as a % with the forecast $ retained as subtext. | Δ pts vs 30d ago |
| **Unworked at-risk ARR** | Σ ARR of At Risk accounts in the window with **no customer call in the last 30d**. This is the leader's "is anyone on it?" number. | Δ $ vs 30d ago |

`p_band` values live in config (`renewal_probabilities.yaml`). CS Ops back-tests them quarterly against actual closed renewals and changes them only by versioned config change. GRR here is a gross forecast: it excludes expansion, and downsell is treated as full ARR at risk under the band probability. We don't report net retention on this page.

---

## 4. Risk drivers

Deterministic rules only. No LLM-generated "why" on this page. Each driver has a fixed code, a label template, a trigger, a severity rank (1 = most severe), and a source ref. The row shows the top 3 by severity. Ties break by larger magnitude.

| Sev | Code | Trigger (evaluated at `as_of_date`) | Label template | Source ref |
|---|---|---|---|---|
| 1 | `CHURN_INTENT` | Customer call in last 90d tagged with churn/cancel/non-renewal intent (Gong tracker `churn_intent`) | "Churn intent raised on call" | `[Gong: 2026-10-14]` (call date; links to call at timestamp) |
| 2 | `URGENT_TICKETS` | ≥1 open High/Urgent HubSpot ticket older than 7d | "2 urgent tickets open >7d" | `[HubSpot: ticket #48213, opened 2026-11-02]` (oldest one) |
| 3 | `USAGE_DROP` | `r ≤ −20%` (requires ≥60d telemetry) | "Active users −32% vs prior 30d" | `[Telemetry: 2026-10-21..2026-11-19 vs 2026-09-21..2026-10-20]` |
| 4 | `NO_CUSTOMER_CALL` | No customer call in last 60d (account age > 90d, Gong-mapped) | "No customer call in 74d" | `[Gong: 2026-09-06]` (last call), or `[Gong: none]` |
| 5 | `RISK_MENTION` | Customer call in last 90d tagged competitor, budget/price pushback, or renewal hesitation (Gong trackers `competitor`, `budget_pricing`, `renewal_hesitation`) | "Competitor mentioned on call" / "Pricing pushback on call" | `[Gong: 2026-10-14]` |
| 6 | `LOW_SEAT_UTILIZATION` | `u < 40%` (seats known) | "Seat utilization 28% (42/150)" | `[Telemetry: WAU 4wk to 2026-11-16; HubSpot: licensed_seats]` |
| 7 | `NO_EXEC_CALL` | ARR ≥ $100k and no exec call in last 90d | "No exec call in 120d" | `[Gong: 2026-07-23]` (last exec call), or `[Gong: none]` |
| 8 | `UNRESOLVED_QUESTIONS` | ≥5 WisdomAI questions in last 30d and `unresolved_rate ≥ 30%` | "41% of chat questions unresolved (9/22)" | `[WisdomAI: 2026-10-21..2026-11-19]` |
| 9 | `KEY_FEATURE_UNADOPTED` | Any key feature below the adoption threshold in last 30d (≥30d telemetry) | "Not adopted: Workflows" (lists up to 2) | `[Telemetry: 2026-10-21..2026-11-19]` |

Rules:
- Ref formats are fixed: `[Source: YYYY-MM-DD]` for a point event, `[Source: YYYY-MM-DD..YYYY-MM-DD]` for a window, `[HubSpot: ticket #id, opened YYYY-MM-DD]` for tickets. Sources are exactly `Gong`, `Telemetry`, `HubSpot`, `WisdomAI`.
- A driver never fires off an excluded component's data (e.g. no `USAGE_DROP` when telemetry is < 60d).
- `data_gaps` show as a separate neutral gray chip ("Data gap: seat count missing"), never as red risk drivers.
- Healthy accounts can still carry drivers (e.g. `NO_EXEC_CALL`). Drivers are evidence, not band.

---

## 5. Explicitly cut (vanity or misleading)

| Cut | Why |
|---|---|
| Total logins / login count | Inflated by SSO refreshes and power users; one person can log in 50 times. Replaced by active user-days. |
| MAU, total registered users | MAU is too lax a bar (one visit a month = "active"); registered users counts people who never came back. WAU/seats is the honest number. |
| Page views, time-in-app, sessions | Activity, not value. Says nothing about renewal. |
| NPS / CSAT | Low response rates, lagging, skewed toward the vocal. Not available per-account with enough density to score. |
| Number of Gong calls / emails / meetings logged | Measures CSM activity, not customer health. Recency and content matter; volume doesn't. |
| Raw WisdomAI question volume | Ambiguous: high volume can mean engagement or confusion. Only the unresolved rate is used. |
| Average Gong sentiment score | An opaque number with no actionable "why". Replaced by specific tagged risk mentions with call dates. |
| Tickets closed / avg resolution time | A support-team efficiency metric, not a customer risk metric. Only open, aged, high-priority tickets matter. |
| Logo count renewing (as a headline) | Treats a $5k account like a $500k one. Count appears only as subtext under ARR. |
| Total ARR under management (all-time, no window) | Doesn't change any decision this week. |
| Health score trend sparklines | The 30d delta carries the signal; a sparkline per row is noise at this density. Belongs on Account Detail. |
| Net revenue retention / expansion pipeline | Different job (expansion view). Mixing it in would hide gross risk. |
| LLM-generated risk summaries | Not deterministic and not auditable in a forecast review. Generated narrative belongs on QBR/Value Story pages with citations. |

---

## 6. Data contract sketch (→ Pydantic v2, mirrored in `/src/types`)

```text
SourceRef
  source: Literal["Gong", "Telemetry", "HubSpot", "WisdomAI"]
  ref_label: str                    # exact bracket text, e.g. "[Gong: 2026-10-14]"
  start_date: date | None
  end_date: date | None             # == start_date for point events
  record_id: str | None             # gong call_id, ticket id, etc.
  url: str | None                   # deep link (Gong call timestamp, HubSpot ticket)

RiskDriver
  code: Literal["CHURN_INTENT","URGENT_TICKETS","USAGE_DROP","NO_CUSTOMER_CALL",
                "RISK_MENTION","LOW_SEAT_UTILIZATION","NO_EXEC_CALL",
                "UNRESOLVED_QUESTIONS","KEY_FEATURE_UNADOPTED"]
  severity: int                     # 1..9, 1 = most severe
  label: str                        # rendered template, e.g. "Active users −32% vs prior 30d"
  source_refs: list[SourceRef]      # min length 1

RenewalsKpiSummary
  as_of_date: date
  window: Literal["next_90d", "days_91_180"]
  owner_filter: str | None          # hubspot owner_id, None = all
  account_count: int
  arr_renewing_usd: float
  arr_renewing_delta_30d_usd: float | None
  arr_at_risk_usd: float
  arr_at_risk_pct: float            # 0..1 of arr_renewing_usd
  arr_at_risk_delta_30d_usd: float | None
  forecast_grr_pct: float           # 0..1
  forecast_retained_arr_usd: float
  forecast_grr_delta_30d_pts: float | None
  unworked_at_risk_arr_usd: float
  unworked_at_risk_arr_delta_30d_usd: float | None
  probability_config_version: str

AccountRenewalRow
  account_id: str
  account_name: str
  plan: str
  owner_id: str
  owner_name: str
  arr_usd: float
  arr_delta_30d_usd: float | None
  renewal_date: date
  days_to_renewal: int              # negative = past due
  is_past_due: bool
  health_score: int | None          # 0..100, None when insufficient data
  health_band: Literal["healthy", "watch", "at_risk", "insufficient_data"]
  band_overridden: bool
  health_score_delta_30d: int | None
  seat_utilization_pct: float | None        # 0..n (may exceed 1), None if seats missing
  seat_utilization_delta_30d_pts: float | None
  wau: int | None
  licensed_seats: int | None
  usage_trend_pct: float | None             # r, e.g. -0.32
  days_since_customer_call: int | None      # None = never
  days_since_exec_call: int | None
  last_customer_call_ref: SourceRef | None
  risk_drivers: list[RiskDriver]            # sorted by severity; UI shows top 3
  data_gaps: list[Literal["telemetry_lt_30d","telemetry_lt_60d","seat_count_missing",
                          "gong_unmapped","gong_new_account","telemetry_unmapped",
                          "tickets_unavailable","renewal_date_missing"]]
  component_scores: dict[Literal["seat_utilization","usage_trend","relationship",
                                 "key_feature_adoption","support_friction"], int | None]
                                            # None = excluded; drives the hover breakdown
```

`@data-architect` owns the SQL that produces these from the daily snapshot. Scoring logic lives in one place (a SQL model or a single Python module), never in the frontend.
