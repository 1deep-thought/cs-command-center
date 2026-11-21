import type { RenewalWindow } from "@/types/renewals";

// URL state for the renewals view. Shared by server (page, toggle links)
// and client (owner select) code, so it must stay free of server-only imports.

export const DEFAULT_WINDOW: RenewalWindow = "next_90d";

export const WINDOW_LABEL: Record<RenewalWindow, string> = {
  next_90d: "Next 90 days",
  days_91_180: "91–180 days",
};

export const WINDOWS: readonly RenewalWindow[] = ["next_90d", "days_91_180"];

export function parseWindow(v: string | undefined): RenewalWindow {
  return v === "days_91_180" ? "days_91_180" : DEFAULT_WINDOW;
}

export function firstParam(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
}

export function renewalsHref(state: {
  window: RenewalWindow;
  owner: string | null | undefined;
}): string {
  const qs = new URLSearchParams();
  if (state.window !== DEFAULT_WINDOW) qs.set("window", state.window);
  if (state.owner) qs.set("owner", state.owner);
  const s = qs.toString();
  return s ? `/?${s}` : "/";
}
