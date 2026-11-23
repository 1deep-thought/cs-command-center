"use client";

import { useEffect, useState, type ReactNode } from "react";
import type {
  AccountDetail,
  AccountHero,
  AccountRow,
  HealthComponentRow,
  HealthTrendRow,
  TimelineRow,
  UsageRow,
} from "@/types/accounts";
import type { PovListItem } from "@/types/pov";
import { Info } from "./info";
import { ago, bandWord, day, dayShort, fmtVal, label, money, moneyK, monthShort, num, pct, person, safeUrl, seg } from "./format";

// Account 360: the hero and six tabs, ported from the cs-analytics page.

export const TABS = [
  ["overview", "Overview"],
  ["score", "Score"],
  ["domains", "Domain health"],
  ["telemetry", "Telemetry"],
  ["crm", "Deals & CRM"],
  ["people", "People"],
] as const;
export type TabKey = (typeof TABS)[number][0];

const BAND_COLOR: Record<string, string> = { green: "var(--green)", yellow: "var(--yellow)", red: "var(--red)" };
const WHITE = { color: "#fff" };
const SMALL = { fontSize: 12 };

function Gauge({ score, band }: { score: number; band: string | null }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg width="124" height="124" viewBox="0 0 124 124" role="img" aria-label={`Health ${Math.round(score)}`}>
      <circle cx="62" cy="62" r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="11" />
      <circle
        cx="62"
        cy="62"
        r={r}
        fill="none"
        stroke={(band && BAND_COLOR[band]) || "var(--accent)"}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`}
        transform="rotate(-90 62 62)"
      />
      <text x="62" y="62" textAnchor="middle" fontSize="30" fontWeight="700" fill="#fff">
        {Math.round(score)}
      </text>
      <text x="62" y="82" textAnchor="middle" fontSize="10" letterSpacing="1.5" fill="rgba(255,255,255,.7)">
        HEALTH
      </text>
    </svg>
  );
}

function Fact({ label: l, children, big = false }: { label: string; children: ReactNode; big?: boolean }) {
  return (
    <div>
      <div className="lbl">{l}</div>
      <div className={big ? "big num" : "val"}>{children}</div>
    </div>
  );
}

function Hero({ b, row, d }: { b: AccountHero; row: AccountRow | undefined; d: AccountDetail }) {
  const reds = d.signals.filter((s) => s.severity === "red");
  const capped = (b.health_guardrails ?? []).length > 0 && num(b.health_score) < num(b.health_score_uncapped);
  const change = num(b.arr_change_30d_usd);
  return (
    <div className="hero">
      <div className="gauge">
        <Gauge score={num(b.health_score)} band={b.health_band} />
        {capped ? (
          <div className="faint" style={SMALL}>
            Capped from {Math.round(num(b.health_score_uncapped))}
          </div>
        ) : null}
        <div style={{ marginTop: 6 }}>
          <a href={`#/account/${b.account_id}/score`}>How this score is built</a>
        </div>
      </div>
      <div>
        <h1>{b.account_name}</h1>
        <div style={{ marginTop: 6 }}>
          <span className="pill accent" style={WHITE}>
            {seg(b.segment)}
          </span>{" "}
          <span className="pill plain">{label(b.plan_tier)}</span>{" "}
          <span className={`pill ${b.health_band ?? "plain"}`}>{bandWord(b.health_band)}</span>
        </div>
        {reds.length ? <div className="banner">{reds.map((s) => s.label).join(" · ")}</div> : null}
        <div className="muted" style={{ marginTop: 6 }}>
          {b.industry || "—"} · {b.employee_count ? Number(b.employee_count).toLocaleString() + " employees" : "employees unknown"} ·{" "}
          {b.primary_domain ? (
            <a style={WHITE} href={`https://${b.primary_domain}`} target="_blank" rel="noopener noreferrer">
              {b.primary_domain}
            </a>
          ) : null}
        </div>
        <div className="grid2">
          <Fact label="CSM">{person(b.csm_owner_email)}</Fact>
          <Fact label="AE">{person(b.ae_owner_email)}</Fact>
          <Fact label="Renewal owner">{person(b.renewal_owner_email)}</Fact>
          <Fact label="HubSpot">
            {safeUrl(d.gaps[0]?.hubspot_url) ? (
              <a style={WHITE} target="_blank" rel="noopener noreferrer" href={safeUrl(d.gaps[0].hubspot_url) ?? undefined}>
                Open company ↗
              </a>
            ) : (
              "—"
            )}
          </Fact>
        </div>
      </div>
      <div className="grid2" style={{ marginTop: 0 }}>
        <div>
          <div className="lbl">ARR</div>
          <div className="big num">{money(b.arr_usd)}</div>
          {change ? (
            <div className="faint">
              {change > 0 ? "+" : ""}
              {moneyK(change)} in 30 days
            </div>
          ) : null}
        </div>
        <div>
          <div className="lbl">Renewal</div>
          <div className="big num">{b.days_to_renewal == null ? "—" : "T−" + b.days_to_renewal}</div>
          <div className="faint">
            {day(b.next_renewal_date)}
            {row?.renewal_stage ? " · " + row.renewal_stage : ""}
            {row?.forecast_category ? " · " + row.forecast_category : ""}
          </div>
        </div>
        <Fact label="Seats used">
          <span className="num">
            {b.active_users_30d ?? "—"} / {b.licensed_seats ?? "—"} <span className="faint">({pct(b.seat_utilization)})</span>
          </span>
        </Fact>
        <Fact label="Chats, 30 days">
          <span className="num">
            {b.chats_30d ?? "—"}{" "}
            <span className="faint">
              {b.chats_30d_delta_pct == null ? "" : (b.chats_30d_delta_pct > 0 ? "+" : "") + pct(b.chats_30d_delta_pct) + " vs prior"}
            </span>
          </span>
        </Fact>
        <Fact label="Open tickets">
          <span className="num">
            {b.open_tickets ?? 0} <span className="faint">{b.open_high_priority_tickets ? `(${b.open_high_priority_tickets} urgent)` : ""}</span>
          </span>
        </Fact>
        <Fact label="Last CSM touch">{ago(b.last_csm_touch_at)}</Fact>
      </div>
    </div>
  );
}

function Timeline({ items }: { items: TimelineRow[] }) {
  if (!items.length) return <li className="muted">No activity.</li>;
  return (
    <>
      {items.map((t, i) => {
        const title = t.title || label(t.event_type);
        return (
          <li key={i}>
            <span className="faint num">{dayShort(t.event_at)}</span>
            <span className={`src ${t.source}`}>{t.source}</span>
            <span>
              {safeUrl(t.source_url) ? (
                <a href={safeUrl(t.source_url) ?? undefined} target="_blank" rel="noopener noreferrer">
                  {title}
                </a>
              ) : (
                title
              )}
              <span className="faint"> · {label(t.event_type)}</span>
            </span>
          </li>
        );
      })}
    </>
  );
}

const DECISION_PILL: Record<string, string> = { go: "green", extend: "yellow", no_go: "red" };

function Overview({ d, povs }: { d: AccountDetail; povs: PovListItem[] }) {
  const lost = [...d.components]
    .sort((a, b) => b.points_available - a.points_available)
    .filter((c) => num(c.points_available) > 0.5)
    .slice(0, 4);
  return (
    <div className="cols">
      <div>
        <h2>Signals and plays</h2>
        {d.signals.length ? (
          d.signals.map((s) => (
            <div key={s.signal_id} className={`sig ${s.severity}`}>
              <b>{s.label}</b> <span className={`pill ${s.severity === "red" ? "red" : "yellow"}`}>{s.severity}</span>
              <div className="d">{s.detail}</div>
              <div className="play">{s.play}</div>
            </div>
          ))
        ) : (
          <div className="card muted">No open signals. Nothing needs action on this account today.</div>
        )}
        <h2>Recent calls</h2>
        <div className="card">
          {d.calls.length ? (
            d.calls.slice(0, 4).map((c, i) => (
              <div key={i} className="call">
                <div className="t">
                  {safeUrl(c.source_url) ? (
                    <a href={safeUrl(c.source_url) ?? undefined} target="_blank" rel="noopener noreferrer">
                      <b>{c.title}</b>
                    </a>
                  ) : (
                    <b>{c.title}</b>
                  )}
                  <span className={`pill ${c.sentiment === "negative" ? "red" : c.sentiment === "positive" ? "green" : "plain"}`}>
                    {c.sentiment || "—"}
                  </span>
                </div>
                <div className="faint" style={SMALL}>
                  {day(c.call_started_at)}
                </div>
                <p>{c.summary}</p>
                {(c.themes ?? []).map((t) => (
                  <span key={t} className="tag">
                    {label(t)}
                  </span>
                ))}
                {(c.competitor_mentions ?? []).map((t) => (
                  <span key={t} className="tag c-red">
                    vs {t}
                  </span>
                ))}
              </div>
            ))
          ) : (
            <div className="muted">No Gong calls recorded.</div>
          )}
        </div>
      </div>
      <div>
        {povs.length ? (
          <>
            <h2>
              Proof of Value <Info tip="PoV plans linked to this account. A Go decision is what turned the prospect into this customer." />
            </h2>
            <div className="card">
              {povs.map((p) => (
                <div key={p.pov_id} className="povline">
                  <div>
                    <a href={`/pov/${p.pov_id}`}>
                      <b>{p.title}</b>
                    </a>
                    <div className="hint">
                      {p.status === "decided" ? "Decided" : label(p.status)}
                      {p.decision_date ? ` · decision ${day(p.decision_date)}` : ""}
                    </div>
                  </div>
                  <span className={`pill ${(p.decision && DECISION_PILL[p.decision]) || "plain"}`}>
                    {p.decision ? label(p.decision).replace("No go", "No-go") : label(p.status)}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
        <h2>Why this score</h2>
        <div className="card">
          {lost.length ? (
            lost.map((c) => (
              <div key={c.metric} className="check">
                <span className="c-red num">−{Math.round(c.points_available)}</span>
                <div>
                  <b>{c.metric_label}</b>
                  <div className="hint">{c.improve_hint}</div>
                </div>
                <span className="faint num">{fmtVal(c.metric, c.value)}</span>
              </div>
            ))
          ) : (
            <div className="muted">Every metric is at full points.</div>
          )}
          <div style={{ marginTop: 10 }}>
            <a href={`#/account/${d.book.account_id}/score`}>Full score explanation →</a>
          </div>
        </div>
        <h2>Recent activity</h2>
        <div className="card">
          <ul className="tl">
            <Timeline items={d.timeline.slice(0, 15)} />
          </ul>
        </div>
      </div>
    </div>
  );
}

function TrendChart({ rows }: { rows: HealthTrendRow[] }) {
  if (!rows.length) return <div className="muted">No history.</div>;
  const W = 900;
  const H = 180;
  const P = 30;
  const n = rows.length;
  const x = (i: number) => P + ((W - P - 8) * i) / Math.max(1, n - 1);
  const y = (v: number) => 10 + (H - 30) * (1 - v / 100);
  const path = (key: "health_score" | "health_score_uncapped") =>
    rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(num(r[key])).toFixed(1)}`).join("");
  const last = rows[n - 1];
  return (
    <>
      <div className="legend">
        <span>
          <i style={{ background: "var(--accent)" }} />
          Health score
        </span>
        <span>
          <i style={{ background: "var(--faint)" }} />
          Before guardrail cap
        </span>
        <span>
          <i style={{ background: "var(--green-soft)" }} />
          Healthy ≥ 70
        </span>
        <span>
          <i style={{ background: "var(--red-soft)" }} />
          At risk &lt; 50
        </span>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Health score trend">
        <rect x={P} y={y(100)} width={W - P - 8} height={y(70) - y(100)} fill="var(--green-soft)" />
        <rect x={P} y={y(50)} width={W - P - 8} height={y(0) - y(50)} fill="var(--red-soft)" />
        {[0, 50, 70, 100].map((v) => (
          <text key={v} x={P - 6} y={y(v) + 4} textAnchor="end">
            {v}
          </text>
        ))}
        {rows.map((r, i) =>
          String(r.snapshot_date).endsWith("-01") ? (
            <text key={r.snapshot_date} x={x(i)} y={H - 4} textAnchor="middle">
              {monthShort(r.snapshot_date)}
            </text>
          ) : null,
        )}
        <path d={path("health_score_uncapped")} fill="none" stroke="var(--faint)" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={path("health_score")} fill="none" stroke="var(--accent)" strokeWidth="2.2" />
        <circle cx={x(n - 1)} cy={y(num(last.health_score))} r="4" fill="var(--accent)" />
      </svg>
    </>
  );
}

const GUARDRAIL: Record<string, string> = {
  answer_quality: "Answer quality is poor (success < 75% and thumbs-down > 5%)",
  support_load: "3 or more urgent tickets are open",
  meeting_gap: "No CSM touch in 90+ days",
};

function Score({ d }: { d: AccountDetail }) {
  const b = d.book;
  const groups = new Map<string, HealthComponentRow[]>();
  for (const c of d.components) groups.set(c.component, [...(groups.get(c.component) ?? []), c]);
  const guard = b.health_guardrails ?? [];
  const applied = num(b.health_score) < num(b.health_score_uncapped);
  const total = d.components.reduce((s, c) => s + num(c.contribution_points), 0);
  return (
    <>
      {guard.length ? (
        <div className="notice">
          <b>Guardrail {applied ? "applied" : "fired"}:</b> {guard.map((g) => GUARDRAIL[g] || g).join("; ")}.{" "}
          {applied
            ? `The score is capped at ${Math.round(num(b.health_score))} (it would otherwise be ${Math.round(num(b.health_score_uncapped))}).`
            : "The score is already below the cap."}
        </div>
      ) : null}
      <h2>Health over the last 6 months</h2>
      <div className="card">
        <TrendChart rows={d.health_trend} />
      </div>
      <h2>
        How the score is built{" "}
        <span className="faint" style={{ textTransform: "none", letterSpacing: 0 }}>
          · {total.toFixed(1)} of 100 points
        </span>
      </h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
              <th>Points earned</th>
              <th>Points lost</th>
            </tr>
          </thead>
          <tbody>
            {[...groups].flatMap(([group, cs]) => {
              const got = cs.reduce((s, c) => s + num(c.contribution_points), 0);
              const max = cs.reduce((s, c) => s + num(c.weight) * 100, 0);
              return [
                <tr key={group}>
                  <td colSpan={4} style={{ background: "var(--surface-2)" }}>
                    <b>{label(group)}</b>{" "}
                    <span className="faint num">
                      {got.toFixed(1)} of {max.toFixed(0)} points
                    </span>
                  </td>
                </tr>,
                ...cs.map((c) => {
                  const losing = num(c.points_available) > 0.5;
                  return (
                    <tr key={`${group}-${c.metric}`} className="comp">
                      <td>
                        <b>{c.metric_label}</b>
                        <div className="hint">{losing ? c.improve_hint : "At full points."}</div>
                      </td>
                      <td className="num">{fmtVal(c.metric, c.value)}</td>
                      <td style={{ minWidth: 200 }}>
                        <div className="pts">
                          <div className="track">
                            <i className="got" style={{ width: `${num(c.weight) ? (num(c.contribution_points) / (num(c.weight) * 100)) * 100 : 0}%` }} />
                            <i className="lost" style={{ flex: 1 }} />
                          </div>
                          <span className="num">
                            {num(c.contribution_points).toFixed(1)}/{(num(c.weight) * 100).toFixed(0)}
                          </span>
                        </div>
                      </td>
                      <td className={`num ${losing ? "c-red" : "faint"}`}>{losing ? "−" + num(c.points_available).toFixed(1) : "—"}</td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

const READINESS: Record<string, string> = { ready: "green", needs_work: "yellow", at_risk: "red" };

function Domains({ d }: { d: AccountDetail }) {
  if (!d.domains.length) {
    return (
      <>
        <h2>Domain health</h2>
        <div className="card muted">No context domains set up yet.</div>
      </>
    );
  }
  return (
    <>
      <h2>
        Knowledge-base readiness by domain{" "}
        <Info tip="Coverage, validation and eval results for each context domain in each Delphina instance." />
      </h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {["Domain", "Readiness", "Coverage", "Validation match", "Eval pass", "Tables documented", "Approved items", "Open gaps", "Inbox issues", "Edits 7d", "Last edit"].map(
                (h) => (
                  <th key={h}>{h}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {d.domains.map((x) => (
              <tr key={`${x.instance_id}-${x.domain_name}`}>
                <td>
                  <b>{x.domain_name}</b>
                  <div className="faint" style={SMALL}>
                    {x.environment} · {x.instance_id}
                  </div>
                </td>
                <td>
                  <span className={`pill ${(x.readiness && READINESS[x.readiness]) || "plain"}`}>{label(x.readiness)}</span>
                </td>
                <td className="num">
                  {pct(x.coverage_pct)}
                  <div className="bar">
                    <i style={{ width: `${num(x.coverage_pct) * 100}%` }} />
                  </div>
                </td>
                <td className="num">{pct(x.validation_match_pct)}</td>
                <td className="num">{pct(x.eval_pass_rate)}</td>
                <td className="num">
                  {x.tables_documented ?? "—"} / {x.tables_in_warehouse ?? "—"}
                </td>
                <td className="num">
                  {x.approved_item_count ?? "—"} / {x.item_count ?? "—"}
                </td>
                <td className={`num ${num(x.open_gaps) ? "c-yellow" : ""}`}>{x.open_gaps ?? 0}</td>
                <td className="num">{x.open_inbox_issues ?? 0}</td>
                <td className="num">{x.edits_7d ?? 0}</td>
                <td>{ago(x.last_edit_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Tile({ label: l, value, sub = "" }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card kpi">
      <div className="l">{l}</div>
      <div className="v num">{value}</div>
      <div className="faint" style={SMALL}>
        {sub}
      </div>
    </div>
  );
}

function UsageChart({ daily }: { daily: UsageRow[] }) {
  if (!daily.length) return <div className="muted">No usage recorded.</div>;
  // Weekly buckets ending on the latest day: total chats, and WAU taken on the bucket's last day.
  const weeks: { start: string; chats: number; wau: number }[] = [];
  for (let end = daily.length; end > 0; end -= 7) {
    const w = daily.slice(Math.max(0, end - 7), end);
    weeks.unshift({ start: w[0].activity_date, chats: w.reduce((s, r) => s + num(r.chats), 0), wau: num(w[w.length - 1].wau) });
  }
  const W = 900;
  const H = 220;
  const P = 38;
  const bw = (W - P - 8) / weeks.length;
  const maxC = Math.max(1, ...weeks.map((r) => r.chats));
  const maxD = Math.max(1, ...weeks.map((r) => r.wau));
  const x = (i: number) => P + bw * i;
  const yc = (v: number) => 10 + (H - 34) * (1 - v / maxC);
  const yd = (v: number) => 10 + (H - 34) * (1 - v / maxD);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly chats and weekly active users">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={P} x2={W - 8} y1={yc(maxC * f)} y2={yc(maxC * f)} stroke="var(--border)" />
          <text x={P - 6} y={yc(maxC * f) + 4} textAnchor="end">
            {Math.round(maxC * f)}
          </text>
        </g>
      ))}
      {weeks.map((r, i) => (
        <rect key={r.start} x={x(i) + 3} y={yc(r.chats)} width={Math.max(2, bw - 6)} height={yc(0) - yc(r.chats)} rx="2" fill="var(--accent)" opacity=".8">
          <title>
            Week of {r.start}: {r.chats} chats, {r.wau} weekly active users
          </title>
        </rect>
      ))}
      <path
        d={weeks.map((r, i) => `${i ? "L" : "M"}${(x(i) + bw / 2).toFixed(1)},${yd(r.wau).toFixed(1)}`).join("")}
        fill="none"
        stroke="var(--green)"
        strokeWidth="2.2"
      />
      {weeks.map((r, i) => (
        <circle key={r.start} cx={x(i) + bw / 2} cy={yd(r.wau)} r="2.5" fill="var(--green)" />
      ))}
      {weeks.map((r, i) =>
        i === 0 || r.start.slice(0, 7) !== weeks[i - 1].start.slice(0, 7) ? (
          <text key={r.start} x={x(i) + bw / 2} y={H - 6} textAnchor="middle">
            {monthShort(r.start)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

const SURFACES: [string, keyof UsageRow][] = [
  ["Slack", "slack_chats"],
  ["MCP", "mcp_chats"],
  ["Research runs", "research_runs"],
  ["Workflow runs", "workflow_runs"],
  ["Knowledge edits", "knowledge_edits"],
];

function Telemetry({ d }: { d: AccountDetail }) {
  const u = d.usage;
  const last30 = u.slice(-30);
  const prev30 = u.slice(-60, -30);
  const sum = (rows: UsageRow[], key: keyof UsageRow) => rows.reduce((s, r) => s + num(r[key]), 0);
  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs prior 30 days` : "");
  const chats = sum(last30, "chats");
  const up = sum(last30, "thumbs_up");
  const down = sum(last30, "thumbs_down");
  return (
    <>
      <div className="kpis">
        <Tile label="Chats, 30 days" value={chats.toLocaleString()} sub={delta(chats, sum(prev30, "chats"))} />
        <Tile label="Monthly active users" value={u.length ? (u[u.length - 1].mau ?? "—") : "—"} sub={`of ${d.book.licensed_seats ?? "—"} seats`} />
        <Tile label="Answer success, 30 days" value={pct(d.book.success_rate_30d)} />
        <Tile label="Thumbs up / down, 30 days" value={`${up} / ${down}`} sub={up + down ? pct(down / (up + down)) + " negative" : ""} />
      </div>
      <h2>Weekly usage, last 6 months</h2>
      <div className="card">
        <div className="legend">
          <span>
            <i style={{ background: "var(--accent)" }} />
            Chats per week
          </span>
          <span>
            <i style={{ background: "var(--green)" }} />
            Weekly active users
          </span>
        </div>
        <UsageChart daily={u} />
      </div>
      <h2>Where usage happens, last 30 days</h2>
      <div className="kpis">
        {SURFACES.map(([l, key]) => (
          <Tile key={key} label={l} value={sum(last30, key).toLocaleString()} sub={delta(sum(last30, key), sum(prev30, key))} />
        ))}
      </div>
      <div className="faint" style={SMALL}>
        Telemetry level: {d.book.telemetry_level || "—"}. Last product activity {ago(d.book.last_product_activity_at)}.
      </div>
    </>
  );
}

const CHECK_ICON: Record<string, ReactNode> = {
  pass: <span className="c-green">✓</span>,
  fail: <span className="c-red">✕</span>,
  skipped: <span className="faint">–</span>,
};

function Crm({ d }: { d: AccountDetail }) {
  return (
    <div className="cols">
      <div>
        <h2>Deals</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {["Deal", "Stage", "Forecast", "ARR", "Close", "Term", "Owner"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.deals.length ? (
                d.deals.map((x) => (
                  <tr key={x.deal_id}>
                    <td>
                      {safeUrl(x.hubspot_url) ? (
                        <a href={safeUrl(x.hubspot_url) ?? undefined} target="_blank" rel="noopener noreferrer">
                          <b>{x.dealname}</b>
                        </a>
                      ) : (
                        <b>{x.dealname}</b>
                      )}
                      <div className="faint" style={SMALL}>
                        {label(x.dealtype)}
                      </div>
                    </td>
                    <td>{x.is_open ? <span className="pill accent">{x.stage}</span> : x.stage}</td>
                    <td>{x.forecast_category || "—"}</td>
                    <td className="num">{money(x.arr_usd)}</td>
                    <td className="num">{day(x.close_date)}</td>
                    <td className="num">{x.contract_start_date ? day(x.contract_start_date) + " → " + day(x.contract_end_date) : "—"}</td>
                    <td>{person(x.owner_email)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty">
                    No deals.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {d.arr.length ? (
          <>
            <h2>ARR changes</h2>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    {["Date", "Movement", "Before", "After", "Change"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.arr.map((m, i) => (
                    <tr key={i}>
                      <td className="num">{day(m.movement_date)}</td>
                      <td>{label(m.movement_type)}</td>
                      <td className="num">{money(m.arr_before_usd)}</td>
                      <td className="num">{money(m.arr_after_usd)}</td>
                      <td className={`num ${num(m.delta_usd) >= 0 ? "c-green" : "c-red"}`}>
                        {num(m.delta_usd) >= 0 ? "+" : ""}
                        {money(m.delta_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
      <div>
        <h2>
          CRM data checklist <Info tip="Read-only hygiene checks. Failing checks never change the health score." />
        </h2>
        <div className="card">
          {d.gaps.length ? (
            d.gaps.map((g) => (
              <div key={g.check_id} className="check">
                {CHECK_ICON[g.status] ?? <span />}
                <div>
                  <b>{g.check_label}</b>
                  {g.status === "fail" ? <div className="hint">{g.fix_hint}</div> : null}
                </div>
                {g.status === "fail" && safeUrl(g.hubspot_url) ? (
                  <a href={safeUrl(g.hubspot_url) ?? undefined} target="_blank" rel="noopener noreferrer">
                    Fix in HubSpot ↗
                  </a>
                ) : (
                  <span className="faint">{g.status}</span>
                )}
              </div>
            ))
          ) : (
            <div className="muted">No checks.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const ROLE_TONE: Record<string, string> = { champion: "green", exec_sponsor: "accent", decision_maker: "accent", detractor: "red" };

function People({ d }: { d: AccountDetail }) {
  return (
    <>
      <h2>People</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {["Name", "Role", "Chats, 30 days", "Last product use", "Last call", "Last ticket"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.people.length ? (
              d.people.map((p, i) => (
                <tr key={i}>
                  <td>
                    {p.name ? <b>{p.name}</b> : <span className="muted">Unnamed product user</span>}
                    <div className="faint" style={SMALL}>
                      {p.title || ""}
                    </div>
                  </td>
                  <td>
                    {p.contact_role && p.contact_role !== "unknown" ? (
                      <span className={`pill ${ROLE_TONE[p.contact_role] || "plain"}`}>{label(p.contact_role)}</span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td className="num">{p.chats_30d ?? 0}</td>
                  <td>{ago(p.last_product_activity_at)}</td>
                  <td>{ago(p.last_call_at)}</td>
                  <td>{ago(p.last_ticket_at)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty">
                  No people matched to this account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h2>Full activity</h2>
      <div className="card">
        <ul className="tl">
          <Timeline items={d.timeline} />
        </ul>
      </div>
    </>
  );
}

async function fetchDetail(id: string): Promise<AccountDetail> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.status === 401) throw new Error("Your session expired. Reload the page to sign in again.");
  if (res.status === 404) throw new Error("There is no such account.");
  if (!res.ok) throw new Error("The account data didn't load. Try again in a moment.");
  return (await res.json()) as AccountDetail;
}

export function Account360({
  id,
  tab,
  book,
  povs,
  detail,
  onLoaded,
}: {
  id: string;
  tab: TabKey;
  book: AccountRow[];
  povs: PovListItem[];
  /** Already fetched in this visit, if so. */
  detail: AccountDetail | undefined;
  onLoaded: (detail: AccountDetail) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  useEffect(() => {
    if (detail) return;
    let live = true;
    fetchDetail(id)
      .then((d) => live && onLoaded(d))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "The account data didn't load."));
    return () => {
      live = false;
    };
    // onLoaded is recreated on every render of the parent; the fetch depends on the account only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, detail, attempt]);

  const row = book.find((a) => a.account_id === id);
  return (
    <>
      <div className="topbar">
        <a className="btn" href="#/">
          ← All accounts
        </a>
        {book.length ? (
          <select aria-label="Account" value={id} onChange={(e) => (window.location.hash = `#/account/${e.target.value}/${tab}`)}>
            {[...book]
              .sort((a, b) => a.account_name.localeCompare(b.account_name))
              .map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.account_name} · {bandWord(a.health_band)}
                </option>
              ))}
          </select>
        ) : null}
      </div>
      <div className="tabs">
        {TABS.map(([key, text]) => (
          <a key={key} href={`#/account/${id}/${key}`} className={key === tab ? "on" : ""}>
            {text}
          </a>
        ))}
      </div>
      {detail ? (
        <>
          <Hero b={detail.book} row={row} d={detail} />
          {tab === "overview" ? <Overview d={detail} povs={povs} /> : null}
          {tab === "score" ? <Score d={detail} /> : null}
          {tab === "domains" ? <Domains d={detail} /> : null}
          {tab === "telemetry" ? <Telemetry d={detail} /> : null}
          {tab === "crm" ? <Crm d={detail} /> : null}
          {tab === "people" ? <People d={detail} /> : null}
        </>
      ) : error ? (
        <div className="card err" style={{ marginTop: 16 }}>
          Could not load this account: {error}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div className="loading">Loading account…</div>
      )}
    </>
  );
}
