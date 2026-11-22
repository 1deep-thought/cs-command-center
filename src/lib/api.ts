import "server-only";
import type { RenewalWindow, RenewalsResponse } from "@/types/renewals";
import { AuthRequiredError, NotAuthorizedError, getIdToken } from "./auth";

// Server-side base URL for the Python API.
// - Local dev: uvicorn on :8000 (see README).
// - Vercel: same deployment, routed via vercel.json rewrite.
function apiBase(): string {
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:8000";
}

export async function getRenewals(params: {
  window: RenewalWindow;
  owner?: string;
}): Promise<RenewalsResponse> {
  const qs = new URLSearchParams({ window: params.window });
  if (params.owner) qs.set("owner", params.owner);
  const token = await getIdToken();
  const res = await fetch(`${apiBase()}/api/py/renewals?${qs}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthRequiredError();
  if (res.status === 403) throw new NotAuthorizedError();
  if (!res.ok) {
    throw new Error(`Renewals API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<RenewalsResponse>;
}
