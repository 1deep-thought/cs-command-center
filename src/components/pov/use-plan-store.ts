"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanView } from "@/types/pov-items";

// Optimistic editing for one plan. A change shows at once and is saved in the background.
// Saves go ONE AT A TIME, in order: every write touches the same PoV row in BigQuery, so
// overlapping saves would collide. Edits to a row that is still waiting to be sent are merged
// into one request. If a save is refused, the changes still waiting are dropped and the plan is
// re-read from the server, so the page never shows something that was not saved.

export type Kind = "pain_point" | "stakeholder" | "criterion" | "milestone";
type Fields = Record<string, unknown>;
type Row = Fields & { version: number };

const KINDS: Record<Kind, { list: "pain_points" | "stakeholders" | "criteria" | "milestones"; id: string; segment: string; noun: string }> = {
  pain_point: { list: "pain_points", id: "pain_point_id", segment: "pain-points", noun: "pain point" },
  stakeholder: { list: "stakeholders", id: "stakeholder_id", segment: "stakeholders", noun: "stakeholder" },
  criterion: { list: "criteria", id: "criterion_id", segment: "criteria", noun: "criterion" },
  milestone: { list: "milestones", id: "milestone_id", segment: "milestones", noun: "date" },
};

type Request = { method: "POST" | "PATCH" | "DELETE"; path: string; body?: Fields };
type Op = {
  key: string; // patches to the same row share a key and are merged while they wait
  what: string; // for the message if the save is refused
  request: (version: (id: string) => number) => Request;
  /** Fold the server's answer into the plan. `overlay` = fields with newer edits still waiting. */
  applied?: (plan: PlanView, data: unknown, overlay: Fields) => PlanView;
  changes?: Fields; // patch payload (merged)
  local?: Fields; // the same edit as view fields
  inFlight?: boolean;
};

export interface Editor {
  /** `body` is the create request without op_id; `local` are the fields to show meanwhile. Returns the new row's id. */
  create(kind: Kind, body: Fields, local: Fields): string;
  /** `local` defaults to `changes`; pass it when the request field is not a view field. */
  patch(kind: Kind, id: string, changes: Fields, local?: Fields): void;
  remove(kind: Kind, id: string): void;
  link(criterionId: string, painPointId: string): void;
  unlink(criterionId: string, painPointId: string): void;
  warn(text: string): void;
}

const RESYNC_ATTEMPTS = 3;

const RULE_TEXT: Record<string, string> = {
  invalid_milestone_order: "Dates must run kickoff, checkpoint, readout, decision.",
  invalid_exercise_length: "Kickoff to decision must be 14 to 60 days.",
  invalid_value_range: "A value needs both a low and a high figure, with high at least as large as low.",
  verification_needs_value_and_basis: "To verify a value, give it a range and say what it is based on.",
};
const CONFLICT_TEXT: Record<string, string> = {
  version_conflict: "someone else changed it first. Their version is shown now.",
  plan_frozen: "the plan is locked.",
  limit_reached: "this plan already has the maximum number.",
  duplicate_kind: "that date is already set.",
};

async function refusal(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as Fields | null;
  if (res.status === 401) return "your session expired. Reload the page to sign in again.";
  if (res.status === 409 && typeof data?.code === "string") return CONFLICT_TEXT[data.code] ?? "it conflicts with the saved plan.";
  if (res.status === 422) return typeof data?.detail === "string" ? (RULE_TEXT[data.detail] ?? "that value isn't allowed.") : "that value isn't allowed.";
  if (res.status === 404) return "that row no longer exists.";
  return "the server didn't confirm it.";
}

function mapRows(plan: PlanView, kind: Kind, fn: (rows: Row[]) => Row[]): PlanView {
  const { list } = KINDS[kind];
  return { ...plan, [list]: fn(plan[list] as unknown as Row[]) } as PlanView;
}

export function usePlanStore(initial: PlanView) {
  const povId = initial.pov.pov_id;
  const [plan, setPlan] = useState(initial);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const planRef = useRef(initial);
  const queue = useRef<Op[]>([]);
  const running = useRef(false);
  const edits = useRef(0);
  const versions = useRef(new Map<string, number>());
  const syncs = useRef(0);

  const update = useCallback((fn: (plan: PlanView) => PlanView) => {
    planRef.current = fn(planRef.current);
    setPlan(planRef.current);
  }, []);

  const resync = useCallback(async () => {
    const stamp = edits.current;
    syncs.current += 1;
    setSyncing(true);
    try {
      for (let attempt = 1; attempt <= RESYNC_ATTEMPTS; attempt += 1) {
        let status = 0;
        try {
          const res = await fetch(`/api/pov/${povId}/plan`, { cache: "no-store" });
          status = res.status;
          if (res.ok) {
            const fresh = (await res.json()) as PlanView;
            // Only when nothing was edited meanwhile: a newer edit must not be painted over.
            // (Then the save queue is running, and it re-reads the plan again when it drains.)
            if (edits.current === stamp && queue.current.length === 0) {
              versions.current.clear();
              planRef.current = fresh;
              setPlan(fresh);
            }
            return;
          }
        } catch {
          // Network error: try again below.
        }
        if (status === 401) {
          setNotice("Your session expired. Reload the page to sign in again.");
          return;
        }
        if (attempt < RESYNC_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
      setNotice("Couldn't re-read the plan from the server. Reload the page to be sure you are looking at what is saved.");
    } finally {
      syncs.current -= 1;
      if (syncs.current === 0) setSyncing(false); // overlapping re-reads: wait for the last one
    }
  }, [povId]);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    const version = (id: string) => {
      const known = versions.current.get(id);
      if (known !== undefined) return known;
      const p = planRef.current;
      const row = [...p.pain_points, ...p.stakeholders, ...p.criteria, ...p.milestones].find((r) =>
        Object.values(r as unknown as Fields).includes(id),
      );
      return row?.version ?? 1;
    };
    while (queue.current.length > 0) {
      const op = queue.current[0];
      op.inFlight = true;
      const req = op.request(version);
      let failure: string | null = null;
      let saved = false;
      let data: unknown = null;
      try {
        const res = await fetch(`/api/pov/${povId}${req.path}`, {
          method: req.method,
          headers: req.body ? { "Content-Type": "application/json" } : undefined,
          body: req.body ? JSON.stringify(req.body) : undefined,
        });
        if (res.ok) {
          saved = true;
          data = res.status === 204 ? null : await res.json().catch(() => null);
        } else {
          failure = await refusal(res);
        }
      } catch {
        failure = "the server couldn't be reached.";
      }
      if (saved) {
        queue.current.shift();
        const overlay: Fields = {};
        for (const waiting of queue.current) if (waiting.key === op.key && waiting.local) Object.assign(overlay, waiting.local);
        try {
          if (op.applied) update((p) => op.applied!(p, data, overlay));
        } catch {
          // The save went through; the re-read after the queue drains puts the screen right.
        }
      }
      if (failure !== null) {
        const dropped = queue.current.length - 1;
        queue.current = [];
        versions.current.clear(); // versions learned from rows that are about to be re-read
        setNotice(
          `Couldn't save ${op.what}: ${failure}` +
            (dropped > 0 ? ` ${dropped} later ${dropped === 1 ? "change was" : "changes were"} not saved either.` : ""),
        );
      }
      setPending(queue.current.length);
    }
    running.current = false;
    await resync(); // readiness, the change counter and anything a colleague changed
  }, [povId, resync, update]);

  const enqueue = useCallback(
    (op: Op) => {
      edits.current += 1;
      // Marking a value verified is its own save: merged with a change to the figures it would
      // verify the new figures, where the server would otherwise void the verification.
      const mergeable = (c?: Fields) => c !== undefined && !("value_source" in c);
      const waiting = mergeable(op.changes)
        ? queue.current.find((q) => q.key === op.key && !q.inFlight && mergeable(q.changes))
        : undefined;
      if (waiting) {
        Object.assign(waiting.changes!, op.changes);
        Object.assign(waiting.local!, op.local);
      } else {
        queue.current.push(op);
      }
      setPending(queue.current.length);
      void run();
    },
    [run],
  );

  // Leaving with saves still in flight would lose them.
  useEffect(() => {
    if (pending === 0) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [pending]);

  const [editor] = useState<Editor>(() => {
    const replace = (kind: Kind, id: string) => (p: PlanView, data: unknown, overlay: Fields) => {
      const server = data as Row | null;
      if (!server) return p;
      versions.current.set(id, server.version);
      return mapRows(p, kind, (rows) => rows.map((r) => (r[KINDS[kind].id] === id ? { ...server, ...overlay } : r)));
    };
    const label = (kind: Kind, id: string) => {
      const row = (planRef.current[KINDS[kind].list] as unknown as Row[]).find((r) => r[KINDS[kind].id] === id);
      const name = row && (row.title ?? row.name ?? row.statement ?? row.kind);
      return typeof name === "string" ? `${KINDS[kind].noun} “${name.length > 40 ? `${name.slice(0, 37)}…` : name}”` : `the ${KINDS[kind].noun}`;
    };
    return {
      create(kind, body, local) {
        const { id: idField, segment, noun } = KINDS[kind];
        const id = crypto.randomUUID(); // the server uses the op_id as the row's id, so we know it up front
        const now = new Date().toISOString();
        const row: Row = {
          pov_id: povId, position: null, created_by: null, updated_by: null, created_at: now, updated_at: now,
          ...local, [idField]: id, version: 1,
        };
        update((p) => mapRows(p, kind, (rows) => [...rows, row]));
        enqueue({
          key: `patch:${kind}:${id}`, // later edits to this row overlay the server's answer
          what: `the new ${noun}`,
          request: () => ({ method: "POST", path: `/${segment}`, body: { ...body, op_id: id } }),
          applied: replace(kind, id),
        });
        return id;
      },
      patch(kind, id, changes, local = changes) {
        const { id: idField, segment } = KINDS[kind];
        const what = label(kind, id);
        update((p) => mapRows(p, kind, (rows) => rows.map((r) => (r[idField] === id ? { ...r, ...local } : r))));
        const merged: Fields = { ...changes };
        enqueue({
          key: `patch:${kind}:${id}`,
          what,
          changes: merged,
          local: { ...local },
          request: (version) => ({
            method: "PATCH", path: `/${segment}/${id}`,
            body: { ...merged, base_version: version(id), op_id: crypto.randomUUID() },
          }),
          applied: replace(kind, id),
        });
      },
      remove(kind, id) {
        const { id: idField, segment } = KINDS[kind];
        const what = label(kind, id);
        const opId = crypto.randomUUID();
        if (!versions.current.has(id)) {
          // Remember the version before the row leaves the screen: the delete request needs it.
          const row = (planRef.current[KINDS[kind].list] as unknown as Row[]).find((r) => r[idField] === id);
          if (row) versions.current.set(id, row.version);
        }
        update((p) => {
          const next = mapRows(p, kind, (rows) => rows.filter((r) => r[idField] !== id));
          // The server removes a deleted row's links in the same transaction.
          return { ...next, links: next.links.filter((l) => l.criterion_id !== id && l.pain_point_id !== id) };
        });
        enqueue({
          key: `delete:${kind}:${id}`,
          what: `the removal of ${what}`,
          request: (version) => ({ method: "DELETE", path: `/${segment}/${id}?base_version=${version(id)}&op_id=${opId}` }),
        });
      },
      link(criterionId, painPointId) {
        update((p) =>
          p.links.some((l) => l.criterion_id === criterionId && l.pain_point_id === painPointId)
            ? p
            : { ...p, links: [...p.links, { criterion_id: criterionId, pain_point_id: painPointId }] },
        );
        enqueue({
          key: `link:${criterionId}:${painPointId}:${edits.current}`,
          what: "the link to a pain point",
          request: () => ({ method: "POST", path: `/criteria/${criterionId}/pain-points`, body: { op_id: crypto.randomUUID(), pain_point_id: painPointId } }),
        });
      },
      unlink(criterionId, painPointId) {
        const opId = crypto.randomUUID();
        update((p) => ({ ...p, links: p.links.filter((l) => !(l.criterion_id === criterionId && l.pain_point_id === painPointId)) }));
        enqueue({
          key: `unlink:${criterionId}:${painPointId}:${edits.current}`,
          what: "the removal of a link",
          request: () => ({ method: "DELETE", path: `/criteria/${criterionId}/pain-points/${painPointId}?op_id=${opId}` }),
        });
      },
      warn: (text) => setNotice(text),
    };
  });

  return { plan, pending, syncing, notice, dismiss: () => setNotice(null), editor, resync };
}
