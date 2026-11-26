"use client";

import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { HEADER_ROW } from "@/components/renewals/layout";
import type { PovDecision, PovOwnerView, Readiness, ReadinessProblem, Team } from "@/types/pov";
import { localPart, planScore, suggestedDecision } from "./format";
import { CHECK_LABEL, DECISION_BADGE, DECISION_LABEL, DECISION_TEXT, PROBLEM_FALLBACK, PROBLEM_TEXT, STATUS_LABEL, STATUS_ORDER } from "./labels";
import { PlanDetails, type AccountOption } from "./plan-details";
import { BAD, BUTTON, INPUT, LINK, MUTED, PILL, PRIMARY, STEPPER, STICKY_HEAD, TONE_GOOD, TONE_WARN, WARN, rowId } from "./layout";

type Action = "start" | "agree" | "lock" | "decide";
const DECISIONS: readonly PovDecision[] = ["go", "extend", "no_go"];
type Notice = { text: string; tone: "bad" | "info"; recheck?: boolean };

const ACTION_LABEL: Record<Action, [idle: string, busy: string]> = {
  start: ["Start collaborating", "Starting…"],
  agree: ["Sponsor has agreed", "Recording…"],
  lock: ["Lock plan", "Locking…"],
  decide: ["Record decision", "Recording…"],
};
const SLOW_AFTER_MS = 4000;

function sentence(problem: ReadinessProblem, names: Record<string, string>): string {
  const text = PROBLEM_TEXT[problem.code] ?? PROBLEM_FALLBACK;
  const name = problem.item_id ? names[problem.item_id] : undefined;
  return text.replace("{name}", name ? `“${name}”` : "One row");
}

function anchor(problem: ReadinessProblem): string | null {
  if (!problem.item_kind || !problem.item_id) return null;
  return `#${rowId[problem.item_kind](problem.item_id)}`;
}

export function PlanHeader({
  pov,
  readiness: initial,
  names,
  stale,
  saving,
  accounts,
  criteria,
  team,
  onTeam,
  onChanged,
  onDetails,
  onAuthNeeded,
  children,
}: {
  pov: PovOwnerView;
  readiness: Readiness;
  /** Row id → the title to show in a problem sentence. */
  names: Record<string, string>;
  /** Edits are still saving (or being re-read), so readiness is out of date and the plan must not move. */
  stale: boolean;
  /** How many changes are waiting to be saved. */
  saving: number;
  /** Customer accounts for the account picker: undefined while loading, null when they couldn't be read. */
  accounts: AccountOption[] | null | undefined;
  /** The plan's criteria: their results give the score a decision is recorded against. */
  criteria: { weight_pct: number; score: number | null }[];
  /** The assigned Account Executive and Solution Engineer. */
  team: Team;
  onTeam: (changes: Partial<Team>) => void;
  /** Save a change to the plan's own details (title, prospect, account, owner). */
  onDetails: (changes: Record<string, unknown>) => void;
  /** A request found the session expired: the page shows sign-in in place. */
  onAuthNeeded: () => void;
  /** Called after the plan's status or agreement changed, to re-read it. */
  onChanged: () => void | Promise<void>;
  children?: ReactNode;
}) {
  const panelId = useId();
  const meterRef = useRef<HTMLButtonElement>(null);
  // A readiness answer from one of this header's own requests wins until the page has re-read
  // the plan (its change counter moves on); after that the page's copy is the newer one.
  const [answer, setAnswer] = useState<{ seq: number; readiness: Readiness } | null>(null);
  const readiness = answer && answer.seq === pov.seq ? answer.readiness : initial;
  const setReadiness = (next: Readiness) => setAnswer({ seq: pov.seq, readiness: next });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [slow, setSlow] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmLock, setConfirmLock] = useState(false);
  const [go, setGo] = useState(String(pov.go_threshold ?? 80));
  const [noGo, setNoGo] = useState(String(pov.no_go_threshold ?? 60));
  const [settling, setSettling] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [note, setNote] = useState("");
  const { score, missing } = planScore(criteria);
  const suggested =
    score === null || pov.go_threshold === null || pov.no_go_threshold === null
      ? null
      : suggestedDecision(score, pov.go_threshold, pov.no_go_threshold);
  const [details, setDetails] = useState(false);
  const detailsRef = useRef<HTMLButtonElement>(null);
  const closeDetails = () => {
    setDetails(false);
    detailsRef.current?.focus(); // the form unmounts: put focus back where it came from
  };
  const accountName = pov.account_id ? accounts?.find((a) => a.account_id === pov.account_id)?.account_name : undefined;

  const frozen = pov.status === "locked" || pov.status === "decided";
  const failing = readiness.checks.filter((c) => !c.ok);
  const passed = readiness.checks.filter((c) => c.ok);
  const toFix = failing.reduce((n, c) => n + c.problems.length, 0);
  const othersPass = failing.every((c) => c.key === "sponsor_agreed");
  const action: Action | null = !readiness.is_owner
    ? null
    : pov.status === "draft"
      ? "start"
      : pov.status === "collaborating"
        ? othersPass && !readiness.ready
          ? "agree"
          : "lock"
        : pov.status === "locked"
          ? "decide"
          : null;
  const pending = busy !== null || settling || stale;

  function refresh() {
    // The page re-reads the plan and hands this header the new status and readiness.
    // Until then the button stays pending.
    setSettling(true);
    void Promise.resolve(onChanged()).finally(() => setSettling(false));
  }

  async function recheck() {
    setNotice(null);
    try {
      const res = await fetch(`/api/pov/${pov.pov_id}/readiness`, { cache: "no-store" });
      if (res.ok) setReadiness((await res.json()) as Readiness);
    } catch {
      // The refresh below reloads everything anyway.
    }
    refresh();
  }

  async function run(which: Action, decision?: PovDecision) {
    if (pending) return;
    if (which === "decide" && !decision) return;
    if (which === "lock" && !readiness.ready) {
      setOpen(true); // not ready: show what is missing instead of sending a request that will be refused
      return;
    }
    const goValue = Number(go);
    const noGoValue = Number(noGo);
    if (which === "lock") {
      const valid = [goValue, noGoValue].every((n) => Number.isInteger(n) && n >= 1 && n <= 100);
      if (!valid || goValue <= noGoValue) {
        setNotice({ text: "Go must be a whole number from 1 to 100, and higher than No-go.", tone: "bad" });
        return;
      }
    }
    setBusy(which);
    setSlow(false);
    setNotice(null);
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const opId = crypto.randomUUID();
    const [path, body] =
      which === "agree"
        ? ["sponsor-agreement", { op_id: opId }]
        : which === "start"
          ? ["transitions", { to: "collaborating", op_id: opId }]
          : which === "decide"
            ? ["transitions", { to: "decided", op_id: opId, decision, ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}) }]
            : ["transitions", { to: "locked", op_id: opId, go_threshold: goValue, no_go_threshold: noGoValue }];
    try {
      const res = await fetch(`/api/pov/${pov.pov_id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.ok) {
        if (which === "agree" && data) setReadiness(data as unknown as Readiness);
        setConfirmLock(false);
        setDeciding(false);
        if (which === "decide" && decision === "go" && !pov.account_id) {
          setNotice({ text: "Decision recorded. Once this prospect is a customer, link the account under Edit details.", tone: "info" });
        }
        refresh();
      } else if (res.status === 422 && data?.detail === "results_missing") {
        setNotice({ text: "Every criterion needs a result before the decision is recorded.", tone: "bad" });
      } else if (res.status === 409 && data?.code === "version_conflict" && which === "decide") {
        setNotice({ text: "A result changed while you were deciding. Check the score, then record the decision again.", tone: "bad", recheck: true });
      } else if (res.status === 422 && data?.detail === "not_ready" && data.readiness) {
        const latest = data.readiness as Readiness;
        setReadiness(latest);
        setOpen(true);
        setConfirmLock(false);
        const count = latest.checks.reduce((n, c) => n + c.problems.length, 0);
        setNotice({ text: `Not ready yet: ${count} to fix before lock.`, tone: "bad" });
      } else if (res.status === 422 && which === "lock") {
        setNotice({ text: "Go must be higher than No-go.", tone: "bad" });
      } else if (res.status === 409 && data?.code === "version_conflict") {
        setNotice({ text: "The plan changed while you were working.", tone: "bad", recheck: true });
      } else if (res.status === 409) {
        const current = (data?.current as PovOwnerView | undefined)?.status;
        setNotice({ text: `This plan is already ${current ? STATUS_LABEL[current].toLowerCase() : "in another status"}.`, tone: "info" });
        refresh();
      } else if (res.status === 403) {
        setNotice({ text: "Only the plan owner can do this.", tone: "bad" });
      } else if (res.status === 401) {
        onAuthNeeded();
        setNotice({ text: "Your session expired. Sign in below, then try again.", tone: "bad" });
      } else {
        setNotice({ text: "Couldn't confirm the save. Try again; retrying is safe.", tone: "bad" });
      }
    } catch {
      setNotice({ text: "Couldn't confirm the save. Try again; retrying is safe.", tone: "bad" });
    } finally {
      clearTimeout(timer);
      setSlow(false);
      setBusy(null);
    }
  }

  return (
    <div
      className={STICKY_HEAD}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          meterRef.current?.focus();
        }
      }}
    >
      <header className={HEADER_ROW}>
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href="/pov" className={`text-xs ${LINK}`}>
            Proof of Value
          </Link>
          <h1
            className="max-w-[40ch] truncate text-[15px] leading-7 font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            title={pov.title}
          >
            {pov.title}
          </h1>
          <span className={`truncate text-xs ${MUTED}`}>{pov.prospect_name}</span>
          {pov.account_id && /^acct_[A-Za-z0-9_-]{1,64}$/.test(pov.account_id) ? (
            <a href={`/#/account/${pov.account_id}`} className={`max-w-[28ch] truncate text-xs ${LINK}`}>
              {accountName ? `Customer: ${accountName}` : "Customer account"}
            </a>
          ) : null}
          <span className={`truncate text-xs ${MUTED}`}>
            Account Executive {team.ae ? localPart(team.ae) : "not assigned"} · Solution Engineer {team.se ? localPart(team.se) : "not assigned"}
          </span>
          {readiness.is_owner ? (
            <button
              ref={detailsRef}
              type="button"
              aria-expanded={details}
              onClick={() => setDetails((v) => !v)}
              className={`text-xs whitespace-nowrap ${LINK}`}
            >
              {details ? "Close details" : "Edit details"}
            </button>
          ) : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {slow ? (
            <span role="status" className={`text-xs ${MUTED}`}>
              Still saving. This can take about 10 seconds.
            </span>
          ) : saving > 0 ? (
            <span role="status" className={`text-xs tabular-nums ${MUTED}`}>
              Saving {saving} {saving === 1 ? "change" : "changes"}…
            </span>
          ) : null}
          {frozen ? null : (
            <button
              ref={meterRef}
              type="button"
              aria-expanded={open}
              aria-controls={open ? panelId : undefined}
              onClick={() => setOpen((v) => !v)}
              className={`${PILL} ${readiness.ready ? TONE_GOOD : TONE_WARN} ${stale ? "opacity-60" : ""}`}
              title={stale ? "Updating after your changes" : undefined}
            >
              {readiness.ready ? (
                <>
                  <span aria-hidden="true">✓</span> Ready to lock
                </>
              ) : (
                `${toFix} to fix before lock`
              )}
              <span aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>
          )}
          {action === "lock" && confirmLock ? (
            <>
              <label className={`flex items-center gap-1 text-xs ${MUTED}`}>
                Go at
                <input inputMode="numeric" value={go} onChange={(e) => setGo(e.target.value)} className={`${INPUT} w-12 text-right tabular-nums`} />
              </label>
              <label className={`flex items-center gap-1 text-xs ${MUTED}`}>
                No-go below
                <input inputMode="numeric" value={noGo} onChange={(e) => setNoGo(e.target.value)} className={`${INPUT} w-12 text-right tabular-nums`} />
              </label>
              <button type="button" disabled={pending} onClick={() => setConfirmLock(false)} className={BUTTON}>
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                aria-busy={pending}
                onClick={() => run("lock")}
                className={`${PRIMARY} ${pending ? "animate-pulse" : ""}`}
              >
                {pending ? ACTION_LABEL.lock[1] : "Lock: no edits after this"}
              </button>
            </>
          ) : action === "decide" && deciding ? (
            <>
              <input
                aria-label="Note on the decision (optional)"
                placeholder="Note (optional)"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                className={`${INPUT} w-56`}
              />
              <span role="group" aria-label="Decision" className="inline-flex items-center gap-2">
                {DECISIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={pending}
                    onClick={() => run("decide", d)}
                    className={`${PILL} ${DECISION_BADGE[d]} ${pending ? "opacity-60" : ""} ${d === suggested ? "ring-2 ring-zinc-400 dark:ring-zinc-500" : ""}`}
                  >
                    {DECISION_LABEL[d]}
                    {d === suggested ? <span className="font-normal opacity-80">· score points here</span> : null}
                  </button>
                ))}
              </span>
              <button type="button" disabled={pending} onClick={() => setDeciding(false)} className={BUTTON}>
                Cancel
              </button>
            </>
          ) : action === "decide" ? (
            <>
              {missing > 0 ? (
                <span className={`text-xs tabular-nums ${MUTED}`}>
                  {missing} {missing === 1 ? "criterion needs" : "criteria need"} a result first
                </span>
              ) : null}
              <button
                type="button"
                disabled={pending || missing > 0 || criteria.length === 0}
                aria-busy={pending}
                onClick={() => setDeciding(true)}
                className={`${PRIMARY} ${pending ? "animate-pulse" : ""}`}
              >
                {ACTION_LABEL.decide[pending && busy === "decide" ? 1 : 0]}
              </button>
            </>
          ) : action ? (
            <button
              type="button"
              disabled={pending}
              aria-busy={pending}
              aria-disabled={action === "lock" && !readiness.ready ? true : undefined}
              onClick={() => {
                if (action === "lock" && readiness.ready) setConfirmLock(true);
                else run(action);
              }}
              className={`${PRIMARY} ${pending ? "animate-pulse" : ""} ${action === "lock" && !readiness.ready ? "opacity-60" : ""}`}
            >
              {ACTION_LABEL[action][pending && busy === action ? 1 : 0]}
            </button>
          ) : null}
        </div>
      </header>
      <ol className={STEPPER} aria-label="Where this plan is">
        {STATUS_ORDER.map((status, i) => {
          const at = STATUS_ORDER.indexOf(pov.status);
          const done = i < at;
          const current = i === at;
          return (
            <li key={status} className="flex items-center gap-2">
              {i > 0 ? <span aria-hidden="true" className="h-px w-6 bg-zinc-200 dark:bg-zinc-800" /> : null}
              <span
                aria-current={current ? "step" : undefined}
                className={`inline-flex items-center gap-1.5 ${current ? "font-medium text-zinc-900 dark:text-zinc-50" : MUTED}`}
              >
                {done ? (
                  <span aria-hidden="true">✓</span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${current ? "bg-zinc-900 dark:bg-zinc-100" : "border border-zinc-400 dark:border-zinc-500"}`}
                  />
                )}
                {STATUS_LABEL[status]}
                {done ? <span className="sr-only"> (done)</span> : null}
                {status === "decided" && current && pov.decision ? (
                  <span className={DECISION_TEXT[pov.decision]}>· {DECISION_LABEL[pov.decision]}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      {notice ? (
        <p role="alert" className={`mt-1.5 flex items-center justify-end gap-2 text-xs ${notice.tone === "bad" ? BAD : MUTED}`}>
          {notice.text}
          {notice.recheck ? (
            <button type="button" onClick={recheck} className={BUTTON}>
              Check again
            </button>
          ) : null}
        </p>
      ) : null}
      {children}
      {details && readiness.is_owner ? (
        <PlanDetails pov={pov} team={team} accounts={accounts} frozen={frozen} onSave={onDetails} onTeam={onTeam} onClose={closeDetails} />
      ) : null}
      {action === "agree" && !notice && !stale ? (
        <p className={`mt-1.5 text-right text-xs ${MUTED}`}>
          Record this once the Sponsor has agreed to the plan as it stands. Any edit afterwards needs it recorded again.
        </p>
      ) : null}
      {open && !frozen ? (
        <div
          id={panelId}
          className="mt-2 max-h-[40vh] overflow-auto rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
        >
          {failing.map((check) => (
            <div
              key={check.key}
              className="grid grid-cols-1 gap-x-3 gap-y-1 border-t border-zinc-200 px-3 py-2 text-xs first:border-t-0 sm:grid-cols-[220px_1fr] dark:border-zinc-800"
            >
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                <span aria-hidden="true" className={WARN}>
                  !{" "}
                </span>
                {CHECK_LABEL[check.key] ?? check.key}
              </p>
              <ul className="space-y-0.5 text-zinc-600 dark:text-zinc-400">
                {check.problems.map((problem, i) => {
                  const href = anchor(problem);
                  return (
                    <li key={`${problem.code}-${problem.item_id ?? i}`}>
                      {href ? (
                        <a href={href} className={LINK} onClick={() => setOpen(false)}>
                          {sentence(problem, names)}
                        </a>
                      ) : (
                        sentence(problem, names)
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {passed.length > 0 ? (
            <p className={`border-t border-zinc-200 px-3 py-2 text-xs first:border-t-0 dark:border-zinc-800 ${MUTED}`}>
              <span aria-hidden="true">✓ </span>
              {passed.length} ready: {passed.map((check) => CHECK_LABEL[check.key] ?? check.key).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
