"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-in";
import type { AccountBook, AccountDetail, AccountRow } from "@/types/accounts";
import type { PovListItem } from "@/types/pov";
import { Account360, TABS, type TabKey } from "./account-360";
import { Info } from "./info";
import { ACCOUNT_ID, bandWord, day, label, money, moneyK, num, pct, person, seg, tone } from "./format";
import "./accounts.css";

// The Renewals tab: the account book (#/) and the Account 360 (#/account/<id>/<tab>). A port of
// the cs-analytics single page, so it keeps that app's hash routes, filters, sorting and layout.

const noop = () => () => {};
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
/** The current "#/..." route. Empty until the page has mounted in the browser. */
function useHash(): string {
  return useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
}
/** False during server rendering: dates and "3d ago" depend on the viewer's locale and clock. */
function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

type SortKey = keyof AccountRow;
type Filters = { q: string; segment: string; tier: string; band: string; renew: string; csm: string; ae: string };
const NO_FILTERS: Filters = { q: "", segment: "", tier: "", band: "", renew: "", csm: "", ae: "" };

const COLS: { key: SortKey; label: string; tip: string }[] = [
  { key: "account_name", label: "Account", tip: "Company, segment and plan. Click a row for the 360 view." },
  { key: "csm_owner_email", label: "Team", tip: "CSM, AE and renewal owner from HubSpot." },
  { key: "health_score", label: "Health", tip: "0–100. Green ≥70, Watch 50–69, At risk <50. Capped at 55 when a guardrail fires." },
  { key: "red_signals", label: "Signals", tip: "Rule-based alerts from ref.signal_rules. Red first." },
  { key: "health_usage_score", label: "Usage", tip: "Usage pillar: chat trend, seat use, answer success, knowledge coverage." },
  { key: "health_engagement_score", label: "Engagement", tip: "Engagement pillar: recent CSM touch, exec sponsor on a call." },
  { key: "health_support_score", label: "Support", tip: "Support pillar: urgent tickets, SLA breaches, CSAT." },
  { key: "lifecycle_stage", label: "Lifecycle", tip: "HubSpot lifecycle stage." },
  { key: "arr_usd", label: "ARR", tip: "Current ARR and change over the last 30 days." },
  { key: "days_to_renewal", label: "Renewal", tip: "Days to next renewal, renewal deal stage and forecast." },
  { key: "data_completeness", label: "CRM data", tip: "Share of CRM hygiene checks passing. Does not affect health." },
];

function Kpi({ label: l, value, cls = "" }: { label: string; value: ReactNode; cls?: string }) {
  return (
    <div className="card kpi">
      <div className="l">{l}</div>
      <div className={`v num ${cls}`}>{value}</div>
    </div>
  );
}

const renewingWithin = (a: AccountRow, days: number) => a.days_to_renewal != null && a.days_to_renewal >= 0 && a.days_to_renewal <= days;

function Row({ a, povs }: { a: AccountRow; povs: PovListItem[] }) {
  const guardrails = a.health_guardrails ?? [];
  const capped = guardrails.length > 0 && num(a.health_score) < num(a.health_score_uncapped);
  const change = num(a.arr_change_30d_usd);
  const gaps = num(a.data_gaps);
  const open = () => {
    window.location.hash = "#/account/" + a.account_id;
  };
  return (
    <tr
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) open();
      }}
    >
      <td className="acct">
        <b>{a.account_name}</b>
        <div className="sub">{a.primary_domain ?? ""}</div>
        <span className="pill accent">{seg(a.segment)}</span> <span className="pill plain">{label(a.plan_tier)}</span>
        {povs.map((p) => (
          <span key={p.pov_id}>
            {" "}
            <a
              className={`pill ${p.decision === "go" ? "green" : p.decision === "no_go" ? "red" : p.decision === "extend" ? "yellow" : "plain"}`}
              href={`/pov/${p.pov_id}`}
              title={`Proof of Value: ${p.title}`}
              onClick={(e) => e.stopPropagation()}
            >
              PoV · {p.decision ? label(p.decision).replace("No go", "No-go") : label(p.status)}
            </a>
          </span>
        ))}
      </td>
      <td className="team">
        <span>CSM</span>
        {person(a.csm_owner_email)}
        <br />
        <span>AE</span>
        {person(a.ae_owner_email)}
        <br />
        <span>Renewal</span>
        {person(a.renewal_owner_email)}
      </td>
      <td>
        <div className={`score num ${tone(a.health_score)}`}>{a.health_score == null ? "—" : Math.round(a.health_score)}</div>
        <span className={`pill ${a.health_band ?? "plain"}`}>{bandWord(a.health_band) || "—"}</span>
        {capped ? (
          <div className="cap" title={`Guardrails: ${guardrails.join(", ")}`}>
            capped from {Math.round(num(a.health_score_uncapped))}
          </div>
        ) : null}
      </td>
      <td>
        <div className="chips">
          {a.signals.length ? (
            a.signals.map((s) => (
              <div key={s.signal_id} className={`chip ${s.severity}`} title={s.detail}>
                {s.label}
              </div>
            ))
          ) : (
            <div className="chip ok">No open signals</div>
          )}
        </div>
      </td>
      {[a.health_usage_score, a.health_engagement_score, a.health_support_score].map((score, i) => (
        <td key={i} className={`metric num ${tone(score)}`}>
          {score == null ? "—" : Math.round(score)}
        </td>
      ))}
      <td>{label(a.lifecycle_stage)}</td>
      <td className="num">
        <b>{money(a.arr_usd)}</b>
        {change ? (
          <div className={change > 0 ? "c-green" : "c-red"} style={{ fontSize: 12 }}>
            {change > 0 ? "+" : ""}
            {moneyK(change)} 30d
          </div>
        ) : null}
      </td>
      <td className="renew num">
        {a.days_to_renewal == null ? (
          "—"
        ) : (
          <>
            <b className={a.days_to_renewal <= 30 ? "c-red" : a.days_to_renewal <= 90 ? "c-yellow" : ""}>T−{a.days_to_renewal}</b>
            <div>{day(a.next_renewal_date)}</div>
            <div>
              {a.renewal_stage || "No renewal deal"}
              {a.forecast_category ? " · " + a.forecast_category : ""}
            </div>
          </>
        )}
      </td>
      <td className="num">
        {pct(a.data_completeness)}
        {gaps ? (
          <div className="c-yellow" style={{ fontSize: 12 }}>
            {gaps} gap{gaps > 1 ? "s" : ""}
          </div>
        ) : null}
        <div className="bar">
          <i style={{ width: `${num(a.data_completeness) * 100}%` }} />
        </div>
      </td>
    </tr>
  );
}

function Accounts({
  book,
  povsByAccount,
  filters: f,
  setFilters,
  sort,
  setSort,
}: {
  book: AccountRow[];
  povsByAccount: Map<string, PovListItem[]>;
  filters: Filters;
  setFilters: (f: Filters) => void;
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
}) {
  const options = (key: "segment" | "plan_tier" | "csm_owner_email" | "ae_owner_email", fmt: (s: string) => string) =>
    [...new Set(book.map((a) => a[key]).filter((v): v is string => Boolean(v)))].sort().map((v) => (
      <option key={v} value={v}>
        {fmt(v)}
      </option>
    ));
  const set = (key: keyof Filters) => (e: { target: { value: string } }) => setFilters({ ...f, [key]: e.target.value });

  const q = f.q.trim().toLowerCase();
  const rows = book
    .filter(
      (a) =>
        (!q || a.account_name.toLowerCase().includes(q) || (a.primary_domain ?? "").includes(q)) &&
        (!f.segment || a.segment === f.segment) &&
        (!f.tier || a.plan_tier === f.tier) &&
        (!f.band || a.health_band === f.band) &&
        (!f.csm || a.csm_owner_email === f.csm) &&
        (!f.ae || a.ae_owner_email === f.ae) &&
        (!f.renew || renewingWithin(a, Number(f.renew))),
    )
    .sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "string" && Number.isNaN(Number(x))) return sort.dir * x.localeCompare(String(y));
      return sort.dir * (Number(x) - Number(y)) || num(b.urgency_score) - num(a.urgency_score);
    });
  const atRisk = rows.filter((a) => a.health_band === "red");
  const total = (list: AccountRow[]) => list.reduce((s, a) => s + num(a.arr_usd), 0);

  return (
    <>
      <h1>Accounts</h1>
      <div className="muted">Your book, sorted by who needs attention first.</div>
      <div className="kpis">
        <Kpi label="Accounts" value={rows.length} />
        <Kpi label="ARR" value={moneyK(total(rows))} />
        <Kpi label="At risk" value={atRisk.length} cls="c-red" />
        <Kpi label="ARR at risk" value={moneyK(total(atRisk))} cls="c-red" />
        <Kpi label="Renewing ≤ 90 days" value={rows.filter((a) => renewingWithin(a, 90)).length} />
        <Kpi label="Open signals" value={rows.reduce((s, a) => s + a.signals.length, 0)} />
      </div>
      <div className="filters">
        <input aria-label="Filter by name or domain" placeholder="Filter by name or domain…" value={f.q} onChange={set("q")} />
        <select aria-label="Segment" value={f.segment} onChange={set("segment")}>
          <option value="">All segments</option>
          {options("segment", seg)}
        </select>
        <select aria-label="Plan" value={f.tier} onChange={set("tier")}>
          <option value="">All plans</option>
          {options("plan_tier", label)}
        </select>
        <select aria-label="Health" value={f.band} onChange={set("band")}>
          <option value="">All health</option>
          <option value="red">At risk</option>
          <option value="yellow">Watch</option>
          <option value="green">Healthy</option>
        </select>
        <select aria-label="Renewal" value={f.renew} onChange={set("renew")}>
          <option value="">All renewals</option>
          <option value="30">Renewing ≤ 30 days</option>
          <option value="90">Renewing ≤ 90 days</option>
          <option value="180">Renewing ≤ 180 days</option>
        </select>
        <select aria-label="CSM" value={f.csm} onChange={set("csm")}>
          <option value="">All CSMs</option>
          {options("csm_owner_email", person)}
        </select>
        <select aria-label="AE" value={f.ae} onChange={set("ae")}>
          <option value="">All AEs</option>
          {options("ae_owner_email", person)}
        </select>
      </div>
      <div className="filters">
        <span className="muted">
          {rows.length} of {book.length} accounts
        </span>
        <span className="sortnote">{sort.key === "urgency_score" ? "SORTED BY URGENCY ↓" : ""}</span>
      </div>
      <div className="tablewrap">
        <table className="book">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className="sort"
                  aria-sort={sort.key === c.key ? (sort.dir > 0 ? "ascending" : "descending") : undefined}
                  onClick={() =>
                    setSort({
                      key: c.key,
                      dir: sort.key === c.key ? (-sort.dir as 1 | -1) : c.key === "account_name" || c.key === "days_to_renewal" ? 1 : -1,
                    })
                  }
                >
                  {c.label}
                  <span className="arrow">{sort.key === c.key ? (sort.dir > 0 ? " ↑" : " ↓") : ""}</span>
                  <Info tip={c.tip} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((a) => <Row key={a.account_id} a={a} povs={povsByAccount.get(a.account_id) ?? []} />)
            ) : (
              <tr>
                <td colSpan={COLS.length} className="empty">
                  No accounts match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Freshness({ book }: { book: AccountBook }) {
  const latest = book.freshness
    .map((f) => f.last_successful_sync_at)
    .filter((s): s is string => Boolean(s))
    .sort()
    .pop();
  const stale = book.freshness.filter((f) => f.status !== "ok").map((f) => f.source);
  return (
    <span className="fresh">
      {stale.length ? <span className="c-yellow">Stale: {stale.join(", ")} · </span> : null}
      Data as of {latest ? new Date(latest).toLocaleString() : "—"}{" "}
      <Info tip={book.freshness.map((f) => f.source + ": " + f.status).join(" · ")} />
    </span>
  );
}

export function AccountsApp({ book, povs }: { book: AccountBook; povs: PovListItem[] }) {
  const mounted = useMounted();
  const hash = useHash();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "urgency_score", dir: -1 });
  // Account 360 data already fetched in this visit, by account id.
  const [details, setDetails] = useState<Record<string, AccountDetail>>({});

  const povsByAccount = new Map<string, PovListItem[]>();
  for (const p of povs) {
    if (p.account_id) povsByAccount.set(p.account_id, [...(povsByAccount.get(p.account_id) ?? []), p]);
  }

  const parts = hash.replace(/^#\/?/, "").split("/");
  const onAccount = parts[0] === "account";
  // No id: default to the first account. A malformed id is an error, never a silent swap.
  const badId = onAccount && !!parts[1] && !ACCOUNT_ID.test(parts[1]);
  const accountId = !onAccount || badId ? undefined : parts[1] || book.accounts[0]?.account_id;
  const tab: TabKey = TABS.some(([key]) => key === parts[2]) ? (parts[2] as TabKey) : "overview";

  return (
    <div className="csa">
      <div className="csa-head">
        <nav aria-label="Renewals">
          <a href="#/" className={onAccount ? "" : "on"}>
            Accounts
          </a>
          <a href="#/account" className={onAccount ? "on" : ""}>
            360
          </a>
          {mounted ? <Freshness book={book} /> : <span className="fresh" />}
          <span className="who">
            <SignOutButton variant="link" />
          </span>
        </nav>
      </div>
      <div className="csa-main">
        {!mounted ? (
          <div className="loading">Loading…</div>
        ) : badId ? (
          <div className="card err" style={{ marginTop: 16 }}>
            There is no such account. <a href="#/">Back to all accounts</a>
          </div>
        ) : onAccount ? (
          accountId ? (
            <Account360
              key={accountId}
              id={accountId}
              tab={tab}
              book={book.accounts}
              povs={povsByAccount.get(accountId) ?? []}
              detail={details[accountId]}
              onLoaded={(detail) => setDetails((all) => ({ ...all, [accountId]: detail }))}
            />
          ) : (
            <div className="empty">No accounts.</div>
          )
        ) : (
          <Accounts
            book={book.accounts}
            povsByAccount={povsByAccount}
            filters={filters}
            setFilters={setFilters}
            sort={sort}
            setSort={setSort}
          />
        )}
      </div>
    </div>
  );
}
