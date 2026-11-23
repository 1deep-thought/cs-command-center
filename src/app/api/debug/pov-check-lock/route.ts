import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api";
import { AuthRequiredError, getIdToken } from "@/lib/auth";

// TEMPORARY smoke test for readiness and status moves. Remove with the other debug files.
// Writes one PoV titled "zz-debug lock ...". About 20 writes at ~7s each, so the limit is raised.
export const maxDuration = 300;

type Step = { step: string; status: number; ok: boolean; note?: string };
type Json = Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  let token: string;
  try {
    token = await getIdToken();
  } catch (error) {
    if (error instanceof AuthRequiredError) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
    throw error;
  }

  const base = `${apiBase()}/api/py/pov`;
  const steps: Step[] = [];
  const call = async (step: string, path: string, method: string, body?: unknown, expect = 200): Promise<Json> => {
    const res = await fetch(`${base}${path}`, {
      method,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Json;
    steps.push({
      step,
      status: res.status,
      ok: res.status === expect,
      note: res.status === expect ? undefined : JSON.stringify(json)?.slice(0, 300),
    });
    return json;
  };
  const check = (step: string, ok: boolean, note?: unknown) =>
    steps.push({ step, status: 200, ok, note: ok ? undefined : JSON.stringify(note)?.slice(0, 400) });
  const failing = (readiness: Json): string[] =>
    ((readiness?.checks ?? []) as { key: string; ok: boolean }[]).filter((c) => !c.ok).map((c) => c.key);
  const op = () => crypto.randomUUID();

  const pov = await call("create PoV", "", "POST", { title: `zz-debug lock ${new Date().toISOString()}`, prospect_name: "zz-debug" }, 201);
  const id = pov?.pov_id as string | undefined;
  if (id) {
    const empty = await call("readiness of an empty plan", `/${id}/readiness`, "GET");
    check("empty plan: 0 of 6, may start collaborating", empty?.passed === 0 && empty?.total === 6 && empty?.allowed_transitions?.[0] === "collaborating", empty);
    await call("lock from draft is rejected (expect 409)", `/${id}/transitions`, "POST", { to: "locked", op_id: op() }, 409);

    const pain = await call("add pain point with value and timeline", `/${id}/pain-points`, "POST", { title: "Slow reports", value_low_minor: 10000000, value_high_minor: 25000000, solve_bucket: "m1_3" }, 201);
    await call("add sponsor", `/${id}/stakeholders`, "POST", { name: "Sam Sponsor", roles: ["sponsor"] }, 201);
    const champ = await call("add champion", `/${id}/stakeholders`, "POST", { name: "Casey Champion", roles: ["champion"] }, 201);
    const scorer = champ?.stakeholder_id as string | undefined;
    const c1 = await call("add criterion (yes/no, 60)", `/${id}/criteria`, "POST", { statement: "Reports load in under 3s", is_yes_no: true, weight_pct: 60, scorer_id: scorer, evidence_source: "test_result" }, 201);
    const c2 = await call("add criterion (target, 30)", `/${id}/criteria`, "POST", { statement: "Weekly active analysts", target_value: 25, unit: "users", weight_pct: 30, scorer_id: scorer, evidence_source: "telemetry" }, 201);
    for (const c of [c1, c2]) {
      if (c?.criterion_id && pain?.pain_point_id) await call(`link criterion ${c.weight_pct}`, `/${id}/criteria/${c.criterion_id}/pain-points`, "POST", { op_id: op(), pain_point_id: pain.pain_point_id }, 201);
    }
    await call("add kickoff", `/${id}/milestones`, "POST", { kind: "kickoff", due_date: "2027-01-04" }, 201);
    await call("add checkpoint", `/${id}/milestones`, "POST", { kind: "checkpoint", due_date: "2027-01-19" }, 201);
    await call("add decision", `/${id}/milestones`, "POST", { kind: "decision", due_date: "2027-02-03" }, 201);

    const partial = await call("readiness with weights at 90", `/${id}/readiness`, "GET");
    check("only criteria and sponsor agreement fail", failing(partial).join() === "criteria,sponsor_agreed", partial);
    check("the criteria problem is weights_not_100", partial?.checks?.[2]?.problems?.[0]?.code === "weights_not_100", partial?.checks?.[2]);
    if (c2?.criterion_id) await call("raise second weight to 40", `/${id}/criteria/${c2.criterion_id}`, "PATCH", { base_version: 1, op_id: op(), weight_pct: 40 });

    const moved = await call("start collaborating", `/${id}/transitions`, "POST", { to: "collaborating", op_id: op() });
    check("status is collaborating", moved?.status === "collaborating", moved);
    await call("start collaborating again (idempotent)", `/${id}/transitions`, "POST", { to: "collaborating", op_id: op() });

    const ready = await call("readiness of the complete plan", `/${id}/readiness`, "GET");
    check("5 of 6: only the Sponsor's agreement is missing", ready?.passed === 5 && failing(ready).join() === "sponsor_agreed", ready);
    const refused = await call("lock without the Sponsor's agreement is refused (expect 422)", `/${id}/transitions`, "POST", { to: "locked", op_id: op() }, 422);
    check("the refusal carries the readiness list", refused?.detail === "not_ready" && refused?.readiness?.passed === 5, refused);
    await call("Go not above No-go is rejected (expect 422)", `/${id}/transitions`, "POST", { to: "locked", op_id: op(), go_threshold: 50, no_go_threshold: 60 }, 422);
    const agreed = await call("owner records the Sponsor's agreement", `/${id}/sponsor-agreement`, "POST", { op_id: op() });
    check("6 of 6 and lock is allowed", agreed?.passed === 6 && agreed?.allowed_transitions?.[0] === "locked", agreed);
    if (pain?.pain_point_id) await call("edit a pain point after the agreement", `/${id}/pain-points/${pain.pain_point_id}`, "PATCH", { base_version: 1, op_id: op(), title: "Slow weekly reports" });
    const voided = await call("lock after the edit is refused (expect 422)", `/${id}/transitions`, "POST", { to: "locked", op_id: op() }, 422);
    check("the edit voided the agreement", voided?.readiness?.checks?.[5]?.problems?.[0]?.code === "plan_changed_since_agreement", voided);
    await call("owner records the agreement again", `/${id}/sponsor-agreement`, "POST", { op_id: op() });
    const locked = await call("lock with Go 85 / No-go 55", `/${id}/transitions`, "POST", { to: "locked", op_id: op(), go_threshold: 85, no_go_threshold: 55 });
    check("locked with thresholds and baseline end date", locked?.status === "locked" && locked?.go_threshold === 85 && locked?.no_go_threshold === 55 && locked?.baseline_end_date === "2027-02-03", locked);
    await call("lock again (idempotent)", `/${id}/transitions`, "POST", { to: "locked", op_id: op() });
    if (pain?.pain_point_id) await call("edit after lock is rejected (expect 409)", `/${id}/pain-points/${pain.pain_point_id}`, "PATCH", { base_version: 2, op_id: op(), title: "x" }, 409);
    await call("agreement after lock is rejected (expect 409)", `/${id}/sponsor-agreement`, "POST", { op_id: op() }, 409);
  }
  return NextResponse.json({ pov_id: id ?? null, all_ok: steps.length > 0 && steps.every((s) => s.ok), steps });
}
