"use client";

import { useState, type ReactNode } from "react";
import { CELL, KPI_CELL, KPI_FOOT, KPI_LABEL, KPI_VALUE, ROW, TABLE_FRAME } from "@/components/renewals/layout";
import type { PovOwnerView } from "@/types/pov";
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
import { AddRow, Chip, EditText, FIELD, Pick, Remove } from "./controls";
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
  plural,
} from "./format";
import { EVIDENCE_LABEL, MILESTONE_LABEL, ROLE_LABEL, SOLVE_LABEL } from "./labels";
import {
  BAD,
  BUTTON,
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
import type { Editor } from "./use-plan-store";

/** `edit` is null when the plan is read-only (locked or decided). */
type Edit = Editor | null;
type Column = { label: string; width?: number | string; align?: "right" };

export function Section({
  title,
  count,
  columns,
  actionsWidth = 44,
  footer,
  children,
}: {
  title: string;
  count?: string;
  columns: readonly Column[];
  actionsWidth?: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const all: Column[] = [...columns, { label: "", width: actionsWidth }];
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
  { label: "Name", width: "22%" },
  { label: "Job title", width: "22%" },
  { label: "Email", width: "24%" },
  { label: "Roles" },
] as const;
const ROLES = Object.keys(ROLE_LABEL) as StakeholderRole[];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function Stakeholders({ items, edit }: { items: Stakeholder[]; edit: Edit }) {
  const sponsor = items.find((s) => s.is_active && s.roles.includes("sponsor"));
  const full = items.length >= ITEM_LIMITS.stakeholders;
  return (
    <Section title="Stakeholders" count={`${items.length} of ${ITEM_LIMITS.stakeholders}`} columns={STAKEHOLDER_COLUMNS} actionsWidth={112}>
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
            className={`${ROW_SM} ${ROW_ANCHOR} ${s.is_active ? "" : "text-zinc-400 dark:text-zinc-500"}`}
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
                    className="w-20 text-xs"
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
                    className="h-6 rounded px-1 text-xs text-zinc-400 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:hover:text-zinc-200"
                  >
                    {s.is_active ? "Left" : "Back"}
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
          placeholder={items.length === 0 ? "Add the Sponsor first: type a name, press Enter" : "Add a stakeholder: type a name, press Enter"}
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
  { label: "Coverage", width: 160 },
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

  const input = `${FIELD} w-[72px] text-right tabular-nums ${problem ? "border-rose-400 hover:border-rose-400" : ""}`;
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
    p.value_source === "verified" ? `Verified by ${p.verified_by ?? DASH}` : valued ? "Prospect-stated" : null;
  return (
    <>
      <tr id={rowId.pain_point(p.pain_point_id)} className={`${ROW} ${ROW_ANCHOR}`}>
        <td className={CELL}>
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? "Hide details" : "Show details"}
              onClick={() => setOpen((v) => !v)}
              className="h-6 w-4 shrink-0 text-xs text-zinc-400 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:hover:text-zinc-200"
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
            <span className={MUTED}>Covered by {plural(covered, "criterion", "criteria")}</span>
          ) : (
            <Flag tone={BAD}>No criterion</Flag>
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

export function PainPoints({ items, links, currency, edit }: { items: PainPoint[]; links: CriterionLink[]; currency: string; edit: Edit }) {
  const max = Math.max(0, ...items.map((p) => p.position ?? 0));
  return (
    <Section title="Pain points" count={`${items.length} of ${ITEM_LIMITS.pain_points}`} columns={PAIN_COLUMNS}>
      {items.length === 0 && !edit ? <EmptyRow span={PAIN_COLUMNS.length}>No pain points.</EmptyRow> : null}
      {items.map((p) => (
        <PainPointRow key={p.pain_point_id} point={p} links={links} currency={currency} edit={edit} />
      ))}
      {edit ? (
        <AddRow
          span={PAIN_COLUMNS.length + 1}
          placeholder="Add a pain point: type a short title, press Enter"
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
  { label: "Scorer", width: 150 },
  { label: "Evidence", width: 150 },
] as const;
const EVIDENCE_OPTIONS = (Object.keys(EVIDENCE_LABEL) as EvidenceSource[]).map((value) => ({ value, label: EVIDENCE_LABEL[value] }));
const TARGET_KINDS = [
  { value: "number", label: "Number" },
  { value: "yes_no", label: "Yes / No" },
] as const;

function CriterionRow({
  criterion: c,
  links,
  painPoints,
  stakeholders,
  edit,
}: {
  criterion: Criterion;
  links: CriterionLink[];
  painPoints: PainPoint[];
  stakeholders: Stakeholder[];
  edit: Edit;
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
    <tr id={rowId.criterion(c.criterion_id)} className={`${ROW} ${ROW_ANCHOR}`}>
      <td className={`${CELL} py-1`}>
        <span className="block font-medium text-zinc-900 dark:text-zinc-100">
          <EditText value={c.statement} onCommit={(statement) => patch({ statement })} editable={Boolean(edit)} label="Criterion" required maxLength={300} />
        </span>
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
              className="h-5 w-28 text-xs"
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
}: {
  items: Criterion[];
  links: CriterionLink[];
  painPoints: PainPoint[];
  stakeholders: Stakeholder[];
  edit: Edit;
}) {
  const total = items.reduce((t, c) => t + c.weight_pct, 0);
  const left = 100 - total;
  const max = Math.max(0, ...items.map((c) => c.position ?? 0));
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
    <Section title="Success criteria" count={`${items.length} of ${ITEM_LIMITS.criteria}`} columns={CRITERIA_COLUMNS} footer={footer}>
      {items.length === 0 && !edit ? <EmptyRow span={CRITERIA_COLUMNS.length}>No success criteria.</EmptyRow> : null}
      {items.map((c) => (
        <CriterionRow key={c.criterion_id} criterion={c} links={links} painPoints={painPoints} stakeholders={stakeholders} edit={edit} />
      ))}
      {edit ? (
        <AddRow
          span={CRITERIA_COLUMNS.length + 1}
          placeholder="Add a success criterion: type what must be true, press Enter (2 to 6, weights totalling 100)"
          full={items.length >= ITEM_LIMITS.criteria ? "This plan has the maximum of 6 success criteria." : undefined}
          onAdd={(statement) =>
            edit.create(
              "criterion",
              { statement },
              {
                statement, target_value: null, unit: null, is_yes_no: false, weight_pct: 0, scorer_id: null,
                evidence_source: null, position: max + 1,
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
      className={`${FIELD} -mx-1.5 ${draft ? "" : "text-zinc-400"}`}
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

export function Timeline({ items, edit }: { items: Milestone[]; edit: Edit }) {
  const kickoff = items.find((m) => m.kind === "kickoff")?.due_date ?? null;
  return (
    <Section title="Timeline" columns={TIMELINE_COLUMNS}>
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
          <tr key={kind} id={m ? rowId.milestone(m.milestone_id) : undefined} className={`${ROW_SM} ${ROW_ANCHOR}`}>
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
                edit ? (
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={m.completed_at !== null}
                      onChange={(e) =>
                        edit.patch("milestone", m.milestone_id, { completed: e.target.checked }, { completed_at: e.target.checked ? new Date().toISOString() : null })
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
