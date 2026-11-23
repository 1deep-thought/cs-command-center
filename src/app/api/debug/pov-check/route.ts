import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api";
import { AuthRequiredError, getIdToken } from "@/lib/auth";

// TEMPORARY smoke test for the PoV API. Remove with src/app/debug/pov once the real PoV screens exist.
// Runs the write path end to end as the signed-in user: create a PoV, add and edit a pain point and a
// stakeholder, trigger a stale-version conflict, list. It writes rows titled "zz-debug ...".
// The Python API still enforces Delphina-only access on every call.

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
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | unknown[] | null;
    steps.push({
      step,
      status: res.status,
      ok: res.status === expect,
      note: res.status === expect ? undefined : JSON.stringify(json)?.slice(0, 300),
    });
    return json as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  const pov = await call("create PoV", "", "POST", { title: `zz-debug ${new Date().toISOString()}`, prospect_name: "zz-debug" }, 201);
  const povId = pov?.pov_id as string | undefined;
  if (povId) {
    const pain = await call("add pain point", `/${povId}/pain-points`, "POST", { title: "Slow reports" }, 201);
    const painId = pain?.pain_point_id as string | undefined;
    if (painId) {
      await call("edit pain point", `/${povId}/pain-points/${painId}`, "PATCH", { base_version: 1, op_id: crypto.randomUUID(), title: "Slower reports" });
      await call("stale edit is rejected (expect 409)", `/${povId}/pain-points/${painId}`, "PATCH", { base_version: 1, op_id: crypto.randomUUID(), title: "Stale" }, 409);
    }
    await call("add stakeholder", `/${povId}/stakeholders`, "POST", { name: "Test Sponsor", roles: ["sponsor"] }, 201);
    await call("list pain points", `/${povId}/pain-points`, "GET");
  }
  return NextResponse.json({ pov_id: povId ?? null, all_ok: steps.length > 0 && steps.every((s) => s.ok), steps });
}
