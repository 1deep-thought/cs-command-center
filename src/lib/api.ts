import "server-only";
import type { RenewalWindow, RenewalsResponse } from "@/types/renewals";

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
  const res = await fetch(`${apiBase()}/api/py/renewals?${qs}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Renewals API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<RenewalsResponse>;
}
