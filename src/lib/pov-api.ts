import "server-only";
import type { PovListItem } from "@/types/pov";
import type { PlanView } from "@/types/pov-items";
import { apiBase } from "./api";
import { AuthRequiredError, NotAuthorizedError, getIdToken } from "./auth";

/** Server-side GET against the PoV API. Returns null on 404; auth problems throw like getRenewals. */
async function povGet<T>(path: string): Promise<T | null> {
  const token = await getIdToken();
  const res = await fetch(`${apiBase()}/api/py/pov${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthRequiredError(true);
  if (res.status === 403) throw new NotAuthorizedError();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PoV API ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getPovList(): Promise<PovListItem[]> {
  return (await povGet<PovListItem[]>("")) ?? [];
}

const POV_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The whole plan and its readiness, or null when there is no such PoV. */
export async function getPlan(povId: string): Promise<PlanView | null> {
  if (!POV_ID.test(povId)) return null;
  return povGet<PlanView>(`/${povId}/plan`);
}

/** The signed-in person's email, read from the sign-in token WITHOUT verifying it. Only for
 * display defaults (the "Mine" filter): every permission check stays in the Python API. */
export async function getViewerEmail(): Promise<string | null> {
  try {
    const payload = (await getIdToken()).split(".")[1];
    const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}
