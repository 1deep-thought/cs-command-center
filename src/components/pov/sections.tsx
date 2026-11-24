"use client";

import { useState, type ReactNode } from "react";
import { CELL, KPI_CELL, KPI_FOOT, KPI_LABEL, KPI_VALUE, ROW, TABLE_FRAME } from "@/components/renewals/layout";
import type { PovOwnerView, ReadinessCheck } from "@/types/pov";
import type {
  Criterion,
  CriterionLink,
  EvidenceSource,
  Milestone,
  MilestoneKind,
  PainPoint,
  PlanView,
  SolveBucket,
  Stakeholder,
  StakeholderRole,
} from "@/types/pov-items";
import { ITEM_LIMITS, MILESTONE_KINDS } from "@/types/pov-items";
import { AddRow, Chip, EditText, Pick, Remove } from "./controls";
import {
  DASH,
  addDays,
  daysBetween,
  formatDate,
  formatDay,
  formatNumber,
  formatRange,
  moneyInput,
  parseMoney,
  planScore,
  plural,
  suggestedDecision,
} from "./format";
import { DECISION_LABEL, DECISION_TEXT, EVIDENCE_LABEL, MILESTONE_LABEL, ROLE_LABEL, SOLVE_LABEL } from "./labels";
import {
  BAD,
  BUTTON,
  FIELD,
  FIELD_INVALID,
  GLYPH,
  GOOD,
  LINK,
  MUTED,
  POV_TABLE,
  ROW_ANCHOR,
  ROW_SM,
  SECTION_HEAD,
  SECTION_TITLE,
  TH,
  WARN,
  rowId,
} from "./layout";
import type { Editor } from "./use-plan-store";

/** `edit` is null when the plan is read-only (locked or decided). */
type Edit = Editor | null;
type Column = { label: string; width?: number | string; align?: "right" };

/** What the lock checks say about one section, shown at the right of its title. */
export type SectionState = { checks: ReadinessCheck[]; stale: boolean } | null;

export function Section({
  title,
  state = null,
  columns,
  actionsWidth = 44,
  footer,
  children,
}: {
  title: string;
  /** Null on read-only plans: nothing left to fix there. */
  state?: SectionState;
  columns: readonly Column[];
  actionsWidth?: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const all: Column[] = [...columns, { label: "", width: actionsWidth }];
  const toFix = state ? state.checks.reduce((n, c) => n + c.problems.length, 0) : 0;
  return (
    <section className="flex flex-col gap-1.5">
      <div className={SECTION_HEAD}>
        <h2 className={SECTION_TITLE}>{title}</h2>
        {state ? (
          <span className={`ml-auto text-xs tabular-nums ${state.stale ? "opacity-50" : ""} ${toFix === 0 ? GOOD : WARN}`}>
            {toFix === 0 ? (
              <>
                <span aria-hidden="true">✓ </span>Ready
              </>
            ) : (
              <>
                <span aria-hidden="true">! </span>
                {toFix} to fix
              </>
            )}
          </span>
        ) : null}
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
        <span className={KPI_LABEL}>Value of solving these, per year</span>
        <span className={KPI_VALUE}>{range(total)}</span>
        <span className={`${KPI_FOOT} ${MUTED}`}>
          <span className="truncate">
            Customer estimate {range(stated)} · Verified {range(verified)}
          </span>
          {unvalued > 0 ? <Flag tone={`whitespace-nowrap ${WARN}`}>{unvalued} without a value</Flag> : null}
        </span>
      </div>
      <div className={KPI_CELL}>
        <span className={KPI_LABEL}>Criteria weighting</span>
        <span className={KPI_VALUE}>{criteria.length === 0 ? DASH : `${weight} / 100`}</span>
        <span className={KPI_FOOT}>
          {criteria.length === 0 ? (
            <span className={MUTED}>No criteria yet</span>
          ) : left === 0 ? (
            <span className={GOOD}>Adds up to 100</span>
          ) : left > 0 ? (
            <span className={WARN}>{left} left</span>
          ) : (
            <span className={BAD}>Over by {-left}</span>
          )}
        </span>
      </div>
      <div className={KPI_CELL}>
        <span className={KPI_LABEL}>Kickoff to decision</span>
        <span className={KPI_VALUE}>{length === null ? DASH : plural(length, "day")}</span>
        <span className={`${KPI_FOOT} ${MUTED}`}>
          {length === null ? "Set kickoff and decision dates" : `${formatDay(kickoff)} – ${formatDay(decision)}`}
        </span>
      </div>
    </div>
  );
}

/** After lock: the score so far against the thresholds agreed at lock, and what they point to. */
export function LockedBanner({ pov, criteria }: { pov: PovOwnerView; criteria: Criterion[] }) {
  if (pov.status !== "locked" && pov.status !== "decided") return null;
  const go = pov.go_threshold;
  const noGo = pov.no_go_threshold;
  const { score, missing } = planScore(criteria);
  // Once decided, the decision itself is what matters: no second opinion next to it.
  const points = score === null || go === null || noGo === null || pov.status === "decided" ? null : suggestedDecision(score, go, noGo);
  return (
    <p className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 tabular-nums dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
        {score === null ? (
          <>Score {DASH}</>
        ) : (
          <>
            Score {score} of 100
            {points ? <span className={`ml-1.5 ${DECISION_TEXT[points]}`}>· points to {DECISION_LABEL[points]}</span> : null}
          </>
        )}
      </span>
      {score === null && criteria.length > 0 ? (
        <span>
          {criteria.length - missing} of {criteria.length} criteria have a result
        </span>
      ) : null}
      <span>
        Go at {go ?? DASH} or more · No-go below {noGo ?? DASH}
      </span>
      <span>Baseline measured to {formatDate(pov.baseline_end_date)}</span>
      <span>
        {pov.status === "decided"
          ? `Decided${pov.decision ? `: ${DECISION_LABEL[pov.decision]}` : ""}. Read-only`
          : "Plan locked. Enter a result for each criterion, then record the decision"}
      </span>
    </p>
  );
}

// ------------------------------------------------------------------ stakeholders

const STAKEHOLDER_COLUMNS = [
  { label: "Name", width: "22%" },
  { label: "Job title", width: "22%" },
  { label: "Email", width: "24%" },
  { label: "Roles" },
] as const;
const ROLES = Object.keys(ROLE_LABEL) as StakeholderRole[];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function Stakeholders({ items, edit, state }: { items: Stakeholder[]; edit: Edit; state: SectionState }) {
  const sponsor = items.find((s) => s.is_active && s.roles.includes("sponsor"));
  const full = items.length >= ITEM_LIMITS.stakeholders;
  return (
    <Section title="Stakeholders" state={state} columns={STAKEHOLDER_COLUMNS} actionsWidth={150}>
      {items.length === 0 && !edit ? <EmptyRow span={STAKEHOLDER_COLUMNS.length}>No stakeholders.</EmptyRow> : null}
      {items.map((s) => {
        const patch = (changes: Record<string, unknown>) => edit?.patch("stakeholder", s.stakeholder_id, changes);
        const options = ROLES.filter((r) => !s.roles.includes(r)).map((r) => {
          const taken = r === "sponsor" && sponsor && sponsor.stakeholder_id !== s.stakeholder_id;
          const clash = (r === "sponsor" && s.roles.includes("evaluator")) || (r === "evaluator" && s.roles.includes("sponsor"));
          return {
            value: r,
            label: taken ? `Sponsor (${sponsor.name} is Sponsor)` : clash ? `${ROLE_LABEL[r]} (not with ${r === "sponsor" ? "Evaluator" : "Sponsor"})` : ROLE_LABEL[r],
            disabled: Boolean(taken) || clash,
          };
        });
        return (
          <tr
            key={s.stakeholder_id}
            id={rowId.stakeholder(s.stakeholder_id)}
            className={`group/row ${ROW_SM} ${ROW_ANCHOR} ${s.is_active ? "" : "text-zinc-500 dark:text-zinc-400"}`}
          >
            <td className={`${CELL} font-medium`}>
              <EditText value={s.name} onCommit={(name) => patch({ name })} editable={Boolean(edit)} label="Name" required maxLength={120} />
            </td>
            <td className={CELL}>
              <EditText value={s.job_title ?? ""} onCommit={(v) => patch({ job_title: v || null })} editable={Boolean(edit)} label="Job title" placeholder="Job title" maxLength={120} />
            </td>
            <td className={CELL}>
              <EditText
                value={s.email ?? ""}
                onCommit={(v) => {
                  if (v && !EMAIL.test(v)) {
                    edit?.warn(`“${v}” doesn't look like an email address, so it wasn't saved.`);
                    return false;
                  }
                  patch({ email: v ? v.toLowerCase() : null });
                }}
                editable={Boolean(edit)}
                label="Email"
                placeholder="Email"
                type="email"
                maxLength={254}
              />
            </td>
            <td className={CELL}>
              <span className="flex items-center gap-1">
                {s.roles.map((role) => (
                  <Chip
                    key={role}
                    label={ROLE_LABEL[role] ?? role}
                    onRemove={edit ? () => patch({ roles: s.roles.filter((r) => r !== role) }) : undefined}
                  >
                    {ROLE_LABEL[role] ?? role}
                  </Chip>
                ))}
                {s.is_active ? null : <Chip label="Inactive">Inactive</Chip>}
                {edit && s.roles.length < 2 ? (
                  <Pick
                    value={null}
                    options={options}
                    onChange={(role) => role && patch({ roles: [...s.roles, role] })}
                    editable
                    label="Add a role"
                    empty="+ role"
                    inline
                  />
                ) : null}
                {!edit && s.roles.length === 0 && s.is_active ? <span className={MUTED}>{DASH}</span> : null}
              </span>
            </td>
            <td className="pr-2 text-right whitespace-nowrap">
              {edit ? (
                <>
                  <button
                    type="button"
                    onClick={() => patch({ is_active: !s.is_active })}
                    aria-label={s.is_active ? `Mark ${s.name} as having left the deal` : `Mark ${s.name} as back on the deal`}
                    title={s.is_active ? "This person has left the deal. They stay on the plan, greyed out." : "This person is back on the deal."}
                    className={`h-6 rounded px-1 text-xs [@media(hover:hover)]:opacity-0 group-focus-within/row:opacity-100! group-hover/row:opacity-100! focus-visible:opacity-100! focus-visible:outline-2 focus-visible:outline-zinc-400 ${GLYPH}`}
                  >
                    {s.is_active ? "Mark as left" : "Mark as back"}
                  </button>
                  <Remove onRemove={() => edit.remove("stakeholder", s.stakeholder_id)} label={s.name} />
                </>
              ) : null}
            </td>
          </tr>
        );
      })}
      {edit ? (
        <AddRow
          span={STAKEHOLDER_COLUMNS.length + 1}
          label={items.length === 0 ? "Add the Sponsor first" : "Add stakeholder"}
          full={full ? "This plan has the maximum of 25 stakeholders." : undefined}
          onAdd={(name) =>
            edit.create("stakeholder", { name }, { name, email: null, job_title: null, roles: [], is_active: true })
          }
        />
      ) : null}
    </Section>
  );
}

// ------------------------------------------------------------------ pain points

const PAIN_COLUMNS = [
  { label: "Pain point" },
  { label: "Value / yr", width: 210, align: "right" },
  { label: "Time to solve", width: 150 },
  { label: "Proven by", width: 170 },
] as const;
const SOLVE_OPTIONS = (Object.keys(SOLVE_LABEL) as SolveBucket[]).map((value) => ({ value, label: SOLVE_LABEL[value] }));

/** Low and high are saved together (the server wants both or neither), when focus leaves the pair. */
function RangeEdit({ point, edit }: { point: PainPoint; edit: Editor }) {
  const savedLow = moneyInput(point.value_low_minor);
  const savedHigh = moneyInput(point.value_high_minor);
  const [low, setLow] = useState(savedLow);
  const [high, setHigh] = useState(savedHigh);
  const [seen, setSeen] = useState(`${savedLow}|${savedHigh}`);
  const [problem, setProblem] = useState(false);
  if (seen !== `${savedLow}|${savedHigh}`) {
    setSeen(`${savedLow}|${savedHigh}`);
    setLow(savedLow);
    setHigh(savedHigh);
    setProblem(false);
  }

  function commit() {
    if (low.trim() === savedLow && high.trim() === savedHigh) return setProblem(false);
    if (!low.trim() && !high.trim()) {
      setProblem(false);
      edit.patch(
        "pain_point",
        point.pain_point_id,
        { value_low_minor: null, value_high_minor: null },
        { value_low_minor: null, value_high_minor: null, value_source: null, verified_by: null, verified_at: null },
      );
      return;
    }
    const [lo, hi] = [parseMoney(low), parseMoney(high)];
    if (lo === null || hi === null || hi < lo) return setProblem(true);
    setProblem(false);
    // Changing the figures voids a verification; the server does the same.
    edit.patch(
      "pain_point",
      point.pain_point_id,
      { value_low_minor: lo, value_high_minor: hi },
      { value_low_minor: lo, value_high_minor: hi, value_source: "prospect_stated", verified_by: null, verified_at: null },
    );
  }

  const input = `${FIELD} w-[72px] text-right tabular-nums ${problem ? FIELD_INVALID : ""}`;
  return (
    <span
      className="flex items-center justify-end gap-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) commit();
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") (e.target as HTMLElement).blur();
        if (e.key === "Escape") {
          setLow(savedLow);
          setHigh(savedHigh);
          setProblem(false);
        }
      }}
      title={problem ? "Enter both figures, like 250k and 1.2m, with the high one at least as large as the low one." : undefined}
    >
      {problem ? (
        <span role="alert" className="sr-only">
          Not saved. Enter both figures, with the high one at least as large as the low one.
        </span>
      ) : null}
      <input aria-label="Low value per year" aria-invalid={problem} placeholder="low" value={low} onChange={(e) => setLow(e.target.value)} className={input} />
      <span aria-hidden="true" className={MUTED}>
        –
      </span>
      <input aria-label="High value per year" aria-invalid={problem} placeholder="high" value={high} onChange={(e) => setHigh(e.target.value)} className={input} />
    </span>
  );
}

function PainPointRow({ point: p, links, currency, edit }: { point: PainPoint; links: CriterionLink[]; currency: string; edit: Edit }) {
  const [open, setOpen] = useState(false);
  const covered = links.filter((l) => l.pain_point_id === p.pain_point_id).length;
  const valued = p.value_low_minor !== null && p.value_high_minor !== null;
  const patch = (changes: Record<string, unknown>) => edit?.patch("pain_point", p.pain_point_id, changes);
  const source =
    p.value_source === "verified" ? `Verified by ${p.verified_by ?? DASH}` : valued ? "Customer estimate" : null;
  return (
    <>
      <tr id={rowId.pain_point(p.pain_point_id)} className={`group/row ${ROW} ${ROW_ANCHOR}`}>
        <td className={CELL}>
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? "Hide details" : "Show details"}
              onClick={() => setOpen((v) => !v)}
              className={`h-6 w-4 shrink-0 text-xs focus-visible:outline-2 focus-visible:outline-zinc-400 ${GLYPH}`}
            >
              {open ? "▾" : "▸"}
            </button>
            <span className="min-w-0 flex-1 font-medium text-zinc-900 dark:text-zinc-100">
              <EditText value={p.title} onCommit={(title) => patch({ title })} editable={Boolean(edit)} label="Pain point" required maxLength={120} />
            </span>
          </span>
          <span className={`block truncate pl-5 text-xs ${MUTED}`}>{p.raised_by ? `Raised by ${p.raised_by}` : "Raised by —"}</span>
        </td>
        <td className={`${CELL} text-right tabular-nums`}>
          {edit ? (
            <RangeEdit point={p} edit={edit} />
          ) : valued ? (
            <span className="block">{formatRange(p.value_low_minor, p.value_high_minor, currency)}</span>
          ) : null}
          <span className="block truncate text-xs">
            {source ? <span className={MUTED}>{source}</span> : <Flag tone={WARN}>No value</Flag>}
          </span>
        </td>
        <td className={CELL}>
          <Pick value={p.solve_bucket} options={SOLVE_OPTIONS} onChange={(solve_bucket) => patch({ solve_bucket })} editable={Boolean(edit)} label="Time to solve" empty="Choose…" />
        </td>
        <td className={`${CELL} text-xs`}>
          {covered > 0 ? (
            <span className={MUTED}>{plural(covered, "criterion", "criteria")}</span>
          ) : (
            <Flag tone={BAD}>Nothing proves this yet</Flag>
          )}
        </td>
        <td className="pr-2 text-right">{edit ? <Remove onRemove={() => edit.remove("pain_point", p.pain_point_id)} label={p.title} /> : null}</td>
      </tr>
      {open ? (
        <tr className="border-t border-dashed border-zinc-100 dark:border-zinc-800/70">
          <td colSpan={PAIN_COLUMNS.length + 1} className="px-3 py-2 pl-8">
            <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-1 text-xs">
              <span className={MUTED}>Description</span>
              <EditText value={p.description ?? ""} onCommit={(v) => patch({ description: v || null })} editable={Boolean(edit)} label="Description" placeholder="What goes wrong today, and for whom" maxLength={500} />
              <span className={MUTED}>Raised by</span>
              <EditText value={p.raised_by ?? ""} onCommit={(v) => patch({ raised_by: v || null })} editable={Boolean(edit)} label="Raised by" placeholder="Who brought this up" maxLength={120} />
              <span className={MUTED}>Value is based on</span>
              <EditText value={p.value_basis ?? ""} onCommit={(v) => patch({ value_basis: v || null })} editable={Boolean(edit)} label="Value basis" placeholder="How the yearly figure was worked out" maxLength={300} />
              <span className={MUTED}>Verification</span>
              <span className="flex h-7 items-center gap-2">
                {p.value_source === "verified" ? (
                  <span className={GOOD}>
                    <span aria-hidden="true">✓ </span>Verified by {p.verified_by ?? DASH}
                    {p.verified_at ? ` on ${formatDay(p.verified_at)}` : ""}
                  </span>
                ) : edit ? (
                  <>
                    <button
                      type="button"
                      disabled={!valued || !p.value_basis}
                      onClick={() => patch({ value_source: "verified" })}
                      className={BUTTON}
                    >
                      Mark as verified
                    </button>
                    {!valued || !p.value_basis ? <span className={MUTED}>Needs a value range and what it is based on.</span> : null}
                  </>
                ) : (
                  <span className={MUTED}>Not verified</span>
                )}
              </span>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function PainPoints({
  items,
  links,
  currency,
  edit,
  state,
}: {
  items: PainPoint[];
  links: CriterionLink[];
  currency: string;
  edit: Edit;
  state: SectionState;
}) {
  const max = Math.max(0, ...items.map((p) => p.position ?? 0));
  return (
    <Section title="Pain points" state={state} columns={PAIN_COLUMNS}>
      {items.length === 0 && !edit ? <EmptyRow span={PAIN_COLUMNS.length}>No pain points.</EmptyRow> : null}
      {items.map((p) => (
        <PainPointRow key={p.pain_point_id} point={p} links={links} currency={currency} edit={edit} />
      ))}
      {edit ? (
        <AddRow
          span={PAIN_COLUMNS.length + 1}
          label="Add pain point"
          full={items.length >= ITEM_LIMITS.pain_points ? "This plan has the maximum of 5 pain points." : undefined}
          onAdd={(title) =>
            edit.create(
              "pain_point",
              { title },
              {
                title, description: null, raised_by: null, value_low_minor: null, value_high_minor: null, value_basis: null,
                value_source: null, verified_by: null, verified_at: null, solve_bucket: null, position: max + 1,
              },
            )
          }
        />
      ) : null}
    </Section>
  );
}

// ------------------------------------------------------------------ criteria

const CRITERIA_COLUMNS = [
  { label: "Criterion" },
  { label: "Target", width: 236 },
  { label: "Weight", width: 68, align: "right" },
  { label: "Who scores it", width: 150 },
  { label: "Evidence", width: 150 },
] as const;
const EVIDENCE_OPTIONS = (Object.keys(EVIDENCE_LABEL) as EvidenceSource[]).map((value) => ({ value, label: EVIDENCE_LABEL[value] }));
const TARGET_KINDS = [
  { value: "number", label: "Number" },
  { value: "yes_no", label: "Yes / No" },
] as const;

// After lock the table swaps "who scores it" and "evidence" for the results themselves.
const RESULT_COLUMNS = [
  { label: "Criterion" },
  { label: "Target", width: 110 },
  { label: "Weight", width: 68, align: "right" },
  { label: "Result", width: 130 },
  { label: "Outcome", width: 120 },
  { label: "Where the proof is", width: 180 },
] as const;
const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;
const OUTCOMES = [
  { value: "100", label: "Met" },
  { value: "50", label: "Partly met" },
  { value: "0", label: "Not met" },
] as const;
const OUTCOME_TONE: Record<string, string> = { "100": GOOD, "50": WARN, "0": BAD };

/** Result, outcome and proof for one criterion. `results` is null once the plan is decided. */
function ResultCells({ criterion: c, results }: { criterion: Criterion; results: Edit }) {
  const save = (changes: Record<string, unknown>) => results?.patch("criterion", c.criterion_id, changes);
  const outcome = c.score === null ? null : String(c.score);
  // A score that isn't one of the three choices (entered elsewhere) still shows as what it is.
  const outcomes: { value: string; label: string }[] =
    outcome !== null && !OUTCOMES.some((o) => o.value === outcome) ? [...OUTCOMES, { value: outcome, label: `Partly met (${outcome})` }] : [...OUTCOMES];
  const yesNo = c.result_value === null ? null : c.result_value >= 1 ? "yes" : "no";
  return (
    <>
      <td className={CELL}>
        {c.is_yes_no ? (
          <Pick
            value={yesNo}
            options={YES_NO}
            // Yes or no IS the outcome, so both are saved together.
            onChange={(v) => save(v === null ? { result_value: null, score: null } : { result_value: v === "yes" ? 1 : 0, score: v === "yes" ? 100 : 0 })}
            editable={Boolean(results)}
            label="Result"
            empty="Choose…"
          />
        ) : results ? (
          <span className="flex items-center gap-1.5">
            <EditText
              value={c.result_value === null ? "" : String(c.result_value)}
              onCommit={(v) => {
                const n = Number(v.replace(/,/g, ""));
                if (v && !Number.isFinite(n)) {
                  results.warn(`“${v}” isn't a number, so the result wasn't saved.`);
                  return false;
                }
                if (v && n === c.result_value) return false;
                save({ result_value: v ? n : null });
              }}
              editable
              label="Measured result"
              placeholder="measured"
              className="w-20 text-right tabular-nums"
            />
            <span className={`truncate text-xs ${MUTED}`}>{c.unit ?? ""}</span>
          </span>
        ) : c.result_value === null ? (
          <span className={MUTED}>{DASH}</span>
        ) : (
          <span className="tabular-nums">
            {formatNumber(c.result_value)} {c.unit ?? ""}
          </span>
        )}
      </td>
      <td className={CELL}>
        {c.is_yes_no || !results ? (
          outcome === null ? (
            <span className={MUTED}>{c.is_yes_no && results ? "Set by the result" : DASH}</span>
          ) : (
            <span className={OUTCOME_TONE[outcome] ?? WARN}>{outcomes.find((o) => o.value === outcome)?.label}</span>
          )
        ) : (
          <Pick value={outcome} options={outcomes} onChange={(v) => save({ score: v === null ? null : Number(v) })} editable label="Outcome" empty="Choose…" />
        )}
      </td>
      <td className={CELL}>
        {results ? (
          <EditText
            value={c.measurement_ref ?? ""}
            onCommit={(v) => save({ measurement_ref: v || null })}
            editable
            label="Where the proof is"
            placeholder="link, deck and slide, query…"
            maxLength={300}
          />
        ) : !c.measurement_ref ? (
          <span className={MUTED}>{DASH}</span>
        ) : /^https:\/\/\S+$/.test(c.measurement_ref) ? (
          <a href={c.measurement_ref} target="_blank" rel="noopener noreferrer" title={c.measurement_ref} className={`block truncate ${LINK}`}>
            {c.measurement_ref}
          </a>
        ) : (
          <span className="block truncate" title={c.measurement_ref}>
            {c.measurement_ref}
          </span>
        )}
      </td>
    </>
  );
}

function CriterionRow({
  criterion: c,
  links,
  painPoints,
  stakeholders,
  edit,
  showResults,
  results,
}: {
  criterion: Criterion;
  links: CriterionLink[];
  painPoints: PainPoint[];
  stakeholders: Stakeholder[];
  edit: Edit;
  /** The plan is locked or decided: show results in place of scorer and evidence. */
  showResults: boolean;
  /** Set while results can still be entered (locked, not yet decided). */
  results: Edit;
}) {
  const patch = (changes: Record<string, unknown>) => edit?.patch("criterion", c.criterion_id, changes);
  const linked = new Set(links.filter((l) => l.criterion_id === c.criterion_id).map((l) => l.pain_point_id));
  const solves = painPoints.filter((p) => linked.has(p.pain_point_id));
  const unlinked = painPoints.filter((p) => !linked.has(p.pain_point_id));
  const scorer = stakeholders.find((s) => s.stakeholder_id === c.scorer_id);
  const scorers = stakeholders
    .filter((s) => s.is_active || s.stakeholder_id === c.scorer_id)
    .map((s) => ({ value: s.stakeholder_id, label: s.is_active ? s.name : `${s.name} (inactive)` }));
  if (c.scorer_id && !scorer) scorers.push({ value: c.scorer_id, label: "No longer on the plan" });

  return (
    <tr id={rowId.criterion(c.criterion_id)} className={`group/row ${ROW} ${ROW_ANCHOR}`}>
      <td className={CELL}>
        <span className="block font-medium text-zinc-900 dark:text-zinc-100">
          <EditText value={c.statement} onCommit={(statement) => patch({ statement })} editable={Boolean(edit)} label="Criterion" required maxLength={300} />
        </span>
        {showResults ? (
          <span className={`block truncate text-xs ${MUTED}`}>
            Scored by {scorer?.name ?? "nobody named"}
            {c.evidence_source ? ` · proof from ${EVIDENCE_LABEL[c.evidence_source].toLowerCase()}` : ""}
          </span>
        ) : null}
        <span className={`flex min-h-5 flex-wrap items-center gap-1 text-xs ${MUTED}`}>
          {solves.length === 0 ? <Flag tone={BAD}>Not linked to a pain point</Flag> : <span>Solves</span>}
          {solves.map((p) =>
            edit ? (
              <Chip key={p.pain_point_id} label={`link to ${p.title}`} onRemove={() => edit.unlink(c.criterion_id, p.pain_point_id)}>
                {p.title}
              </Chip>
            ) : (
              <a key={p.pain_point_id} href={`#${rowId.pain_point(p.pain_point_id)}`} className={LINK}>
                {p.title}
              </a>
            ),
          )}
          {edit && unlinked.length > 0 ? (
            <Pick
              value={null}
              options={unlinked.map((p) => ({ value: p.pain_point_id, label: p.title }))}
              onChange={(id) => id && edit.link(c.criterion_id, id)}
              editable
              label="Link a pain point this criterion solves"
              empty="+ pain point"
              inline
            />
          ) : null}
        </span>
      </td>
      <td className={CELL}>
        {edit ? (
          <span className="flex items-center gap-1">
            <Pick
              value={c.is_yes_no ? "yes_no" : "number"}
              options={TARGET_KINDS}
              onChange={(kind) => kind && patch({ is_yes_no: kind === "yes_no" })}
              editable
              label="Target type"
              empty="Type…"
              className="w-[92px]"
            />
            {c.is_yes_no ? null : (
              <>
                <EditText
                  value={c.target_value === null ? "" : String(c.target_value)}
                  onCommit={(v) => {
                    const n = Number(v.replace(/,/g, ""));
                    if (v && !Number.isFinite(n)) {
                      edit.warn(`“${v}” isn't a number, so the target wasn't saved.`);
                      return false;
                    }
                    if (v && n === c.target_value) return false; // "5.0" over a saved 5: nothing to save
                    patch({ target_value: v ? n : null });
                  }}
                  editable
                  label="Target value"
                  placeholder="target"
                  className="w-16 text-right tabular-nums"
                />
                <EditText value={c.unit ?? ""} onCommit={(v) => patch({ unit: v || null })} editable label="Unit" placeholder="unit" maxLength={40} className="w-16" />
              </>
            )}
          </span>
        ) : c.is_yes_no ? (
          "Yes / No"
        ) : c.target_value === null ? (
          <span className={MUTED}>{DASH}</span>
        ) : (
          <span className="tabular-nums">
            {formatNumber(c.target_value)} {c.unit ?? ""}
          </span>
        )}
      </td>
      <td className={`${CELL} text-right tabular-nums`}>
        <EditText
          value={String(c.weight_pct)}
          onCommit={(v) => {
            const n = Number(v);
            if (!Number.isInteger(n) || n < 0 || n > 100) {
              edit?.warn("A weight is a whole number from 0 to 100.");
              return false;
            }
            patch({ weight_pct: n });
          }}
          editable={Boolean(edit)}
          label="Weight"
          required
          className="text-right tabular-nums"
        />
      </td>
      {showResults ? (
        <ResultCells criterion={c} results={results} />
      ) : (
        <>
          <td className={CELL}>
            {edit ? (
              <Pick value={c.scorer_id} options={scorers} onChange={(scorer_id) => patch({ scorer_id })} editable label="Scorer" empty="Choose…" />
            ) : scorer ? (
              <span className="block truncate">{scorer.name}</span>
            ) : c.scorer_id ? (
              <Flag tone={`text-xs ${BAD}`}>Not on the plan</Flag>
            ) : (
              <span className={MUTED}>{DASH}</span>
            )}
          </td>
          <td className={CELL}>
            <Pick value={c.evidence_source} options={EVIDENCE_OPTIONS} onChange={(evidence_source) => patch({ evidence_source })} editable={Boolean(edit)} label="Evidence source" empty="Choose…" />
          </td>
        </>
      )}
      <td className="pr-2 text-right">{edit ? <Remove onRemove={() => edit.remove("criterion", c.criterion_id)} label={c.statement} /> : null}</td>
    </tr>
  );
}

export function Criteria({
  items,
  links,
  painPoints,
  stakeholders,
  edit,
  state,
  showResults = false,
  results = null,
}: {
  items: Criterion[];
  links: CriterionLink[];
  painPoints: PainPoint[];
  stakeholders: Stakeholder[];
  edit: Edit;
  state: SectionState;
  showResults?: boolean;
  results?: Edit;
}) {
  const columns = showResults ? RESULT_COLUMNS : CRITERIA_COLUMNS;
  const { score, missing } = planScore(items);
  const total = items.reduce((t, c) => t + c.weight_pct, 0);
  const left = 100 - total;
  const max = Math.max(0, ...items.map((c) => c.position ?? 0));
  const footer =
    items.length === 0 ? null : showResults ? (
      <p className="flex h-9 items-center justify-end border-t border-zinc-100 px-3 text-xs tabular-nums dark:border-zinc-800/70">
        {score === null ? (
          <span className={results ? WARN : MUTED}>
            {missing} of {items.length} still {missing === 1 ? "needs" : "need"} a result
          </span>
        ) : (
          <span>Score {score} of 100 (each weight × its outcome)</span>
        )}
      </p>
    ) : (
      <p className="flex h-9 items-center justify-end border-t border-zinc-100 px-3 text-xs tabular-nums dark:border-zinc-800/70">
        <span>Total {total} / 100</span>
        <span className={`ml-1.5 ${left === 0 ? GOOD : left > 0 ? WARN : BAD}`}>
          · {left === 0 ? "fully allocated" : left > 0 ? `${left} left` : `over by ${-left}`}
        </span>
      </p>
    );
  return (
    <Section title={showResults ? "Success criteria and results" : "Success criteria"} state={state} columns={columns} footer={footer}>
      {items.length === 0 && !edit ? <EmptyRow span={columns.length}>No success criteria.</EmptyRow> : null}
      {items.map((c) => (
        <CriterionRow
          key={c.criterion_id}
          criterion={c}
          links={links}
          painPoints={painPoints}
          stakeholders={stakeholders}
          edit={edit}
          showResults={showResults}
          results={results}
        />
      ))}
      {edit ? (
        <AddRow
          span={CRITERIA_COLUMNS.length + 1}
          label="Add success criterion"
          full={items.length >= ITEM_LIMITS.criteria ? "This plan has the maximum of 6 success criteria." : undefined}
          onAdd={(statement) =>
            edit.create(
              "criterion",
              { statement },
              {
                statement, target_value: null, unit: null, is_yes_no: false, weight_pct: 0, scorer_id: null,
                evidence_source: null, result_value: null, score: null, measurement_ref: null, position: max + 1,
              },
            )
          }
        />
      ) : null}
    </Section>
  );
}

// ------------------------------------------------------------------ timeline

const TIMELINE_COLUMNS = [
  { label: "Milestone", width: 220 },
  { label: "Date", width: 170 },
  { label: "Day", width: 80, align: "right" },
  { label: "Status" },
] as const;
// Offsets suggested once a kickoff is set (design: days 15, 28 and 30). Never applied silently.
const SUGGESTED: Partial<Record<MilestoneKind, number>> = { checkpoint: 15, readout: 28, decision: 30 };

/** A date saves when focus leaves the field or on Enter, never while it is being typed
 * (a half-typed year is already a valid date as far as the browser is concerned). */
function DateEdit({ value, label, onCommit }: { value: string; label: string; onCommit: (value: string) => boolean }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(value);
  if (saved !== value) {
    setSaved(value);
    setDraft(value);
  }
  return (
    <input
      type="date"
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
      onBlur={(e) => {
        const next = e.currentTarget.value; // the field's own value: Escape may have just reset the draft
        if (!next || next === value || !onCommit(next)) setDraft(value);
      }}
      className={`${FIELD} -mx-1.5 w-full ${draft ? "" : "text-zinc-500! dark:text-zinc-400!"}`}
    />
  );
}

/** The server's date rules, checked before saving so a refused date never costs a round trip. */
function dateProblem(items: Milestone[], kind: MilestoneKind, date: string): string | null {
  const dates = new Map(items.map((m) => [m.kind, m.due_date]));
  dates.set(kind, date);
  const present = MILESTONE_KINDS.map((k) => dates.get(k)).filter((d): d is string => Boolean(d));
  if (present.some((d, i) => i > 0 && d < present[i - 1])) {
    return "Dates must run kickoff, checkpoint, readout, decision. To move the whole timeline, move the dates one at a time, starting from the end you are moving towards.";
  }
  const length = daysBetween(dates.get("kickoff"), dates.get("decision"));
  if (length !== null && (length < 14 || length > 60)) {
    return `Kickoff to decision must be 14 to 60 days; that would make it ${length}.`;
  }
  return null;
}

export function Timeline({
  items,
  edit,
  state,
  progress = null,
}: {
  items: Milestone[];
  edit: Edit;
  state: SectionState;
  /** Set on a locked plan: dates are fixed, but milestones can still be ticked off. */
  progress?: Edit;
}) {
  const tick = edit ?? progress;
  const kickoff = items.find((m) => m.kind === "kickoff")?.due_date ?? null;
  return (
    <Section title="Timeline" state={state} columns={TIMELINE_COLUMNS}>
      {MILESTONE_KINDS.map((kind) => {
        const m = items.find((item) => item.kind === kind);
        const offset = m ? daysBetween(kickoff, m.due_date) : null;
        const suggestion = !m && SUGGESTED[kind] !== undefined ? addDays(kickoff, SUGGESTED[kind]) : null;
        const set = (due_date: string): boolean => {
          if (!edit || !due_date) return false;
          const problem = dateProblem(items, kind, due_date);
          if (problem) {
            edit.warn(problem);
            return false;
          }
          if (m) edit.patch("milestone", m.milestone_id, { due_date });
          else edit.create("milestone", { kind, due_date }, { kind, due_date, completed_at: null });
          return true;
        };
        return (
          <tr key={kind} id={m ? rowId.milestone(m.milestone_id) : undefined} className={`group/row ${ROW_SM} ${ROW_ANCHOR}`}>
            <td className={`${CELL} font-medium`}>
              {MILESTONE_LABEL[kind]}
              {kind === "readout" ? <span className={`ml-1.5 text-xs font-normal ${MUTED}`}>optional</span> : null}
            </td>
            <td className={`${CELL} tabular-nums`}>
              {edit ? (
                <DateEdit value={m?.due_date ?? ""} label={`${MILESTONE_LABEL[kind]} date`} onCommit={set} />
              ) : m?.due_date ? (
                formatDate(m.due_date)
              ) : (
                <span className={MUTED}>Not set</span>
              )}
            </td>
            <td className={`${CELL} text-right tabular-nums ${MUTED}`}>{offset === null ? DASH : `Day ${offset}`}</td>
            <td className={`${CELL} text-xs`}>
              {m ? (
                tick ? (
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={m.completed_at !== null}
                      onChange={(e) =>
                        tick.patch("milestone", m.milestone_id, { completed: e.target.checked }, { completed_at: e.target.checked ? new Date().toISOString() : null })
                      }
                    />
                    <span className={m.completed_at ? GOOD : MUTED}>{m.completed_at ? `Done ${formatDay(m.completed_at)}` : "Not done"}</span>
                  </label>
                ) : m.completed_at ? (
                  <span className={GOOD}>
                    <span aria-hidden="true">✓ </span>Done {formatDay(m.completed_at)}
                  </span>
                ) : (
                  <span className={MUTED}>Not done</span>
                )
              ) : edit && suggestion ? (
                <button type="button" onClick={() => set(suggestion)} className={`${LINK} focus-visible:outline-2 focus-visible:outline-zinc-400`}>
                  Use {formatDay(suggestion)} (day {SUGGESTED[kind]})
                </button>
              ) : (
                <span className={MUTED}>{DASH}</span>
              )}
            </td>
            <td className="pr-2 text-right">
              {edit && m ? <Remove onRemove={() => edit.remove("milestone", m.milestone_id)} label={`${MILESTONE_LABEL[kind]} date`} /> : null}
            </td>
          </tr>
        );
      })}
    </Section>
  );
}
