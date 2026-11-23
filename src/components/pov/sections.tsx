import type { ReactNode } from "react";
import { CELL, KPI_CELL, KPI_FOOT, KPI_LABEL, KPI_VALUE, ROW, TABLE_FRAME } from "@/components/renewals/layout";
import type { PovOwnerView } from "@/types/pov";
import type { Criterion, CriterionLink, Milestone, PainPoint, PlanView, Stakeholder } from "@/types/pov-items";
import { MILESTONE_KINDS } from "@/types/pov-items";
import { DASH, daysBetween, formatDate, formatDay, formatNumber, formatRange, plural } from "./format";
import { EVIDENCE_LABEL, MILESTONE_LABEL, ROLE_LABEL, SOLVE_LABEL } from "./labels";
import {
  BAD,
  BADGE,
  GOOD,
  LINK,
  MUTED,
  POV_TABLE,
  ROW_ANCHOR,
  ROW_SM,
  SECTION_COUNT,
  SECTION_HEAD,
  SECTION_TITLE,
  TH,
  WARN,
  rowId,
} from "./layout";

type Column = { label: string; width?: number | string; align?: "right" };
const ACTIONS: Column = { label: "", width: 32 }; // reserved for row actions (editing slice)

export function Section({
  title,
  count,
  columns,
  footer,
  children,
}: {
  title: string;
  count?: string;
  columns: readonly Column[];
  footer?: ReactNode;
  children: ReactNode;
}) {
  const all = [...columns, ACTIONS];
  return (
    <section className="flex flex-col gap-1.5">
      <div className={SECTION_HEAD}>
        <h2 className={SECTION_TITLE}>{title}</h2>
        {count ? <span className={SECTION_COUNT}>{count}</span> : null}
      </div>
      <div className={`${TABLE_FRAME} overflow-x-auto`}>
        <table className={POV_TABLE}>
          <colgroup>
            {all.map((c, i) => (
              <col key={i} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {all.map((c, i) => (
                <th key={i} scope="col" className={`${TH} ${c.align === "right" ? "text-right" : ""}`}>
                  {c.label || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
        {footer}
      </div>
    </section>
  );
}

function EmptyRow({ span, children }: { span: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={span + 1} className={`h-12 px-3 text-xs ${MUTED}`}>
        {children}
      </td>
    </tr>
  );
}

/** Text with a leading mark, so a problem never depends on color alone. */
function Flag({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={tone}>
      <span aria-hidden="true">! </span>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ summary

function sum(points: PainPoint[]): { low: number; high: number } | null {
  if (points.length === 0) return null;
  return {
    low: points.reduce((t, p) => t + (p.value_low_minor ?? 0), 0),
    high: points.reduce((t, p) => t + (p.value_high_minor ?? 0), 0),
  };
}

export function Summary({ plan }: { plan: PlanView }) {
  const { pov, pain_points, criteria, milestones } = plan;
  const valued = pain_points.filter((p) => p.value_low_minor !== null && p.value_high_minor !== null);
  const unvalued = pain_points.length - valued.length;
  const total = sum(valued);
  const stated = sum(valued.filter((p) => p.value_source !== "verified"));
  const verified = sum(valued.filter((p) => p.value_source === "verified"));
  const range = (r: { low: number; high: number } | null) => (r ? formatRange(r.low, r.high, pov.currency) : DASH);

  const weight = criteria.reduce((t, c) => t + c.weight_pct, 0);
  const left = 100 - weight;
  const kickoff = milestones.find((m) => m.kind === "kickoff")?.due_date ?? null;
  const decision = milestones.find((m) => m.kind === "decision")?.due_date ?? null;
  const length = daysBetween(kickoff, decision);

  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 lg:grid-cols-[2fr_1fr_1fr] dark:border-zinc-800 dark:bg-zinc-800">
      <div className={KPI_CELL}>
        <span className={KPI_LABEL}>Annual value at stake</span>
        <span className={KPI_VALUE}>{range(total)}</span>
        <span className={`${KPI_FOOT} ${MUTED}`}>
          <span className="truncate">
            Prospect-stated {range(stated)} · Verified {range(verified)}
          </span>
          {unvalued > 0 ? <Flag tone={`whitespace-nowrap ${WARN}`}>{unvalued} without a value</Flag> : null}
        </span>
      </div>
      <div className={KPI_CELL}>
        <span className={KPI_LABEL}>Weight</span>
        <span className={KPI_VALUE}>{criteria.length === 0 ? DASH : `${weight} / 100`}</span>
        <span className={KPI_FOOT}>
          {criteria.length === 0 ? (
            <span className={MUTED}>No criteria yet</span>
          ) : left === 0 ? (
            <span className={GOOD}>Fully allocated</span>
          ) : left > 0 ? (
            <span className={WARN}>{left} left</span>
          ) : (
            <span className={BAD}>Over by {-left}</span>
          )}
        </span>
      </div>
      <div className={KPI_CELL}>
        <span className={KPI_LABEL}>Exercise length</span>
        <span className={KPI_VALUE}>{length === null ? DASH : plural(length, "day")}</span>
        <span className={`${KPI_FOOT} ${MUTED}`}>
          {length === null ? "Set kickoff and decision dates" : `${formatDay(kickoff)} – ${formatDay(decision)}`}
        </span>
      </div>
    </div>
  );
}

export function LockedBanner({ pov }: { pov: PovOwnerView }) {
  if (pov.status !== "locked" && pov.status !== "decided") return null;
  return (
    <p className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 tabular-nums dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      <span className="font-medium text-zinc-900 dark:text-zinc-100">Locked</span>
      <span>Read-only</span>
      <span>Go at {pov.go_threshold ?? DASH} or more</span>
      <span>No-go below {pov.no_go_threshold ?? DASH}</span>
      <span>Baseline end {formatDate(pov.baseline_end_date)}</span>
    </p>
  );
}

// ------------------------------------------------------------------ stakeholders

const STAKEHOLDER_COLUMNS = [
  { label: "Name", width: "24%" },
  { label: "Job title", width: "24%" },
  { label: "Email", width: "28%" },
  { label: "Roles" },
] as const;

export function Stakeholders({ items }: { items: Stakeholder[] }) {
  return (
    <Section title="Stakeholders" count={`${items.length} of 25`} columns={STAKEHOLDER_COLUMNS}>
      {items.length === 0 ? (
        <EmptyRow span={STAKEHOLDER_COLUMNS.length}>
          No stakeholders yet. Add the Sponsor and a Champion or Evaluator.
        </EmptyRow>
      ) : (
        items.map((s) => (
          <tr
            key={s.stakeholder_id}
            id={rowId.stakeholder(s.stakeholder_id)}
            className={`${ROW_SM} ${ROW_ANCHOR} ${s.is_active ? "" : "text-zinc-400 dark:text-zinc-500"}`}
          >
            <td className={`${CELL} truncate font-medium`}>{s.name}</td>
            <td className={`${CELL} truncate`}>{s.job_title ?? DASH}</td>
            <td className={`${CELL} truncate`}>{s.email ?? DASH}</td>
            <td className={CELL}>
              <span className="flex flex-wrap gap-1">
                {s.roles.map((role) => (
                  <span key={role} className={`${BADGE} border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300`}>
                    {ROLE_LABEL[role] ?? role}
                  </span>
                ))}
                {s.is_active ? null : (
                  <span className={`${BADGE} border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-600`}>Inactive</span>
                )}
                {s.roles.length === 0 && s.is_active ? <span className={MUTED}>{DASH}</span> : null}
              </span>
            </td>
            <td />
          </tr>
        ))
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ pain points

const PAIN_COLUMNS = [
  { label: "Pain point" },
  { label: "Value / yr", width: 190, align: "right" },
  { label: "Time to solve", width: 130 },
  { label: "Coverage", width: 170 },
] as const;

export function PainPoints({ items, links, currency }: { items: PainPoint[]; links: CriterionLink[]; currency: string }) {
  return (
    <Section title="Pain points" count={`${items.length} of 5`} columns={PAIN_COLUMNS}>
      {items.length === 0 ? (
        <EmptyRow span={PAIN_COLUMNS.length}>No pain points yet. Add up to 5, each with a yearly value.</EmptyRow>
      ) : (
        items.map((p) => {
          const covered = links.filter((l) => l.pain_point_id === p.pain_point_id).length;
          const valued = p.value_low_minor !== null && p.value_high_minor !== null;
          return (
            <tr key={p.pain_point_id} id={rowId.pain_point(p.pain_point_id)} className={`${ROW} ${ROW_ANCHOR}`}>
              <td className={CELL}>
                <span className="block truncate font-medium text-zinc-900 dark:text-zinc-100" title={p.description ?? undefined}>
                  {p.title}
                </span>
                <span className={`block truncate text-xs ${MUTED}`}>{p.raised_by ? `Raised by ${p.raised_by}` : "Raised by —"}</span>
              </td>
              <td className={`${CELL} text-right tabular-nums`}>
                {valued ? (
                  <>
                    <span className="block" title={p.value_basis ?? undefined}>
                      {formatRange(p.value_low_minor, p.value_high_minor, currency)}
                    </span>
                    <span className={`block truncate text-xs ${MUTED}`}>
                      {p.value_source === "verified" ? `Verified by ${p.verified_by ?? DASH}` : "Prospect-stated"}
                    </span>
                  </>
                ) : (
                  <Flag tone={`text-xs ${WARN}`}>No value</Flag>
                )}
              </td>
              <td className={CELL}>
                {p.solve_bucket ? SOLVE_LABEL[p.solve_bucket] ?? p.solve_bucket : <span className={MUTED}>{DASH}</span>}
              </td>
              <td className={`${CELL} text-xs`}>
                {covered > 0 ? (
                  <span className={MUTED}>Covered by {plural(covered, "criterion", "criteria")}</span>
                ) : (
                  <Flag tone={BAD}>No criterion</Flag>
                )}
              </td>
              <td />
            </tr>
          );
        })
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ criteria

const CRITERIA_COLUMNS = [
  { label: "Criterion" },
  { label: "Target", width: 140, align: "right" },
  { label: "Weight", width: 72, align: "right" },
  { label: "Scorer", width: 160 },
  { label: "Evidence", width: 140 },
] as const;

export function Criteria({
  items,
  links,
  painPoints,
  stakeholders,
}: {
  items: Criterion[];
  links: CriterionLink[];
  painPoints: PainPoint[];
  stakeholders: Stakeholder[];
}) {
  const total = items.reduce((t, c) => t + c.weight_pct, 0);
  const left = 100 - total;
  const footer =
    items.length === 0 ? null : (
      <p className="flex h-9 items-center justify-end border-t border-zinc-100 px-3 text-xs tabular-nums dark:border-zinc-800/70">
        <span>Total {total} / 100</span>
        <span className={`ml-1.5 ${left === 0 ? GOOD : left > 0 ? WARN : BAD}`}>
          · {left === 0 ? "fully allocated" : left > 0 ? `${left} left` : `over by ${-left}`}
        </span>
      </p>
    );
  return (
    <Section title="Success criteria" count={`${items.length} of 6`} columns={CRITERIA_COLUMNS} footer={footer}>
      {items.length === 0 ? (
        <EmptyRow span={CRITERIA_COLUMNS.length}>No success criteria yet. Add up to 6 that total 100.</EmptyRow>
      ) : (
        items.map((c) => {
          const solves = links
            .filter((l) => l.criterion_id === c.criterion_id)
            .map((l) => painPoints.find((p) => p.pain_point_id === l.pain_point_id))
            .filter((p): p is PainPoint => p !== undefined);
          const scorer = stakeholders.find((s) => s.stakeholder_id === c.scorer_id);
          return (
            <tr key={c.criterion_id} id={rowId.criterion(c.criterion_id)} className={`${ROW} ${ROW_ANCHOR}`}>
              <td className={CELL}>
                <span className="block truncate font-medium text-zinc-900 dark:text-zinc-100" title={c.statement}>
                  {c.statement}
                </span>
                <span className={`block truncate text-xs ${MUTED}`}>
                  {solves.length === 0 ? (
                    <Flag tone={BAD}>Not linked to a pain point</Flag>
                  ) : (
                    <>
                      Solves:{" "}
                      {solves.map((p, i) => (
                        <span key={p.pain_point_id}>
                          {i > 0 ? ", " : ""}
                          <a href={`#${rowId.pain_point(p.pain_point_id)}`} className={LINK}>
                            {p.title}
                          </a>
                        </span>
                      ))}
                    </>
                  )}
                </span>
              </td>
              <td className={`${CELL} truncate text-right tabular-nums`}>
                {c.is_yes_no ? "Yes / No" : c.target_value === null ? <span className={MUTED}>{DASH}</span> : `${formatNumber(c.target_value)} ${c.unit ?? ""}`}
              </td>
              <td className={`${CELL} text-right tabular-nums`}>{c.weight_pct}</td>
              <td className={`${CELL} truncate`}>
                {scorer ? scorer.name : c.scorer_id ? <Flag tone={`text-xs ${BAD}`}>Not on the plan</Flag> : <span className={MUTED}>{DASH}</span>}
              </td>
              <td className={`${CELL} truncate`}>
                {c.evidence_source ? EVIDENCE_LABEL[c.evidence_source] ?? c.evidence_source : <span className={MUTED}>{DASH}</span>}
              </td>
              <td />
            </tr>
          );
        })
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ timeline

const TIMELINE_COLUMNS = [
  { label: "Milestone", width: 200 },
  { label: "Date", width: 140 },
  { label: "Day", width: 80, align: "right" },
  { label: "Status" },
] as const;

export function Timeline({ items }: { items: Milestone[] }) {
  const kickoff = items.find((m) => m.kind === "kickoff")?.due_date ?? null;
  return (
    <Section title="Timeline" columns={TIMELINE_COLUMNS}>
      {MILESTONE_KINDS.map((kind) => {
        const m = items.find((item) => item.kind === kind);
        const offset = m ? daysBetween(kickoff, m.due_date) : null;
        return (
          <tr key={kind} id={m ? rowId.milestone(m.milestone_id) : undefined} className={`${ROW_SM} ${ROW_ANCHOR}`}>
            <td className={`${CELL} font-medium`}>
              {MILESTONE_LABEL[kind]}
              {kind === "readout" ? <span className={`ml-1.5 text-xs font-normal ${MUTED}`}>optional</span> : null}
            </td>
            <td className={`${CELL} tabular-nums`}>{m?.due_date ? formatDate(m.due_date) : <span className={MUTED}>Not set</span>}</td>
            <td className={`${CELL} text-right tabular-nums ${MUTED}`}>{offset === null ? DASH : `Day ${offset}`}</td>
            <td className={`${CELL} text-xs`}>
              {!m ? (
                <span className={MUTED}>{DASH}</span>
              ) : m.completed_at ? (
                <span className={GOOD}>
                  <span aria-hidden="true">✓ </span>Done {formatDay(m.completed_at)}
                </span>
              ) : (
                <span className={MUTED}>Not done</span>
              )}
            </td>
            <td />
          </tr>
        );
      })}
    </Section>
  );
}
