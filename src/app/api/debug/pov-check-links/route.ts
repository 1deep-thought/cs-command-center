import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api";
import { AuthRequiredError, getIdToken } from "@/lib/auth";

// TEMPORARY smoke test for milestones and criterion<->pain point links. Remove with the other debug files.
// Writes one PoV titled "zz-debug links ...". About 12 writes at ~7s each, so the limit is raised.
export const maxDuration = 300;

type Step = { step: string; status: number; ok: boolean; note?: string };

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
  const call = async (step: string, path: string, method: string, body?: unknown, expect = 200) => {
    const res = await fetch(`${base}${path}`, {
      method,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Record<string, any> | any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    steps.push({
      step,
      status: res.status,
      ok: res.status === expect,
      note: res.status === expect ? undefined : JSON.stringify(json)?.slice(0, 300),
    });
    return json as Record<string, any> | any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const check = (step: string, ok: boolean, note?: string) => steps.push({ step, status: 200, ok, note: ok ? undefined : note });

  const pov = (await call("create PoV", "", "POST", { title: `zz-debug links ${new Date().toISOString()}`, prospect_name: "zz-debug" }, 201)) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const povId = pov?.pov_id as string | undefined;
  if (povId) {
    const pain = (await call("add pain point", `/${povId}/pain-points`, "POST", { title: "Slow reports" }, 201)) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    const crit = (await call("add criterion", `/${povId}/criteria`, "POST", { statement: "Reports load in under 3s", is_yes_no: true, weight_pct: 50 }, 201)) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    const painId = pain?.pain_point_id as string | undefined;
    const critId = crit?.criterion_id as string | undefined;

    const kick = (await call("add kickoff milestone", `/${povId}/milestones`, "POST", { kind: "kickoff", due_date: "2027-01-04" }, 201)) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    await call("checkpoint before kickoff is rejected (expect 422)", `/${povId}/milestones`, "POST", { kind: "checkpoint", due_date: "2027-01-01" }, 422);
    await call("add decision milestone (30 days after kickoff)", `/${povId}/milestones`, "POST", { kind: "decision", due_date: "2027-02-03" }, 201);
    await call("second kickoff is rejected (expect 409)", `/${povId}/milestones`, "POST", { kind: "kickoff", due_date: "2027-01-05" }, 409);
    if (kick?.milestone_id) {
      const done = (await call("mark kickoff completed", `/${povId}/milestones/${kick.milestone_id}`, "PATCH", { base_version: 1, op_id: crypto.randomUUID(), completed: true })) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      check("completed_at is set", Boolean(done?.completed_at), JSON.stringify(done));
    }

    if (painId && critId) {
      await call("link criterion to pain point", `/${povId}/criteria/${critId}/pain-points`, "POST", { op_id: crypto.randomUUID(), pain_point_id: painId }, 201);
      await call("link again (idempotent)", `/${povId}/criteria/${critId}/pain-points`, "POST", { op_id: crypto.randomUUID(), pain_point_id: painId }, 201);
      await call("link to a missing pain point (expect 404)", `/${povId}/criteria/${critId}/pain-points`, "POST", { op_id: crypto.randomUUID(), pain_point_id: "nope" }, 404);
      const links = (await call("list links", `/${povId}/criterion-links`, "GET")) as any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      check("exactly one link", Array.isArray(links) && links.length === 1, JSON.stringify(links));
      await call("delete pain point", `/${povId}/pain-points/${painId}?base_version=1&op_id=${crypto.randomUUID()}`, "DELETE", undefined, 204);
      const after = (await call("list links after delete", `/${povId}/criterion-links`, "GET")) as any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      check("link removed with the pain point", Array.isArray(after) && after.length === 0, JSON.stringify(after));
    }
    await call("list milestones", `/${povId}/milestones`, "GET");
  }
  return NextResponse.json({ pov_id: povId ?? null, all_ok: steps.length > 0 && steps.every((s) => s.ok), steps });
}
