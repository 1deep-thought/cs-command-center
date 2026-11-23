// Display helpers for the Renewals tab, ported from the cs-analytics page so values read the same.
// They use the viewer's locale and clock, so they run in the browser only (the page mounts first).

import type { HealthBand } from "@/types/accounts";

type Num = number | string | null | undefined;

export const num = (v: Num): number => (v == null ? 0 : Number(v));

/** "drew.banerjee@delphina.ai" → "Drew Banerjee". */
export function person(email: string | null | undefined): string {
  if (!email) return "—";
  return email
    .split("@")[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

export const money = (v: Num): string => (v == null ? "—" : "$" + Math.round(Number(v)).toLocaleString());

export function moneyK(v: Num): string {
  if (v == null) return "—";
  const n = Number(v);
  return Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : "$" + Math.round(n / 1000) + "k";
}

export const pct = (v: Num, digits = 0): string => (v == null ? "—" : (Number(v) * 100).toFixed(digits) + "%");

const asDate = (s: string): Date => new Date(s.length <= 10 ? s + "T00:00:00" : s);

/** "Jan 24, 2027" in the viewer's locale. */
export function day(s: string | null | undefined): string {
  return s ? asDate(String(s)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}
/** "Jan 24": the same without the year. */
export function dayShort(s: string | null | undefined): string {
  return s ? asDate(String(s)).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
}
export function monthShort(s: string): string {
  return asDate(s).toLocaleDateString(undefined, { month: "short" });
}

export function ago(s: string | null | undefined): string {
  if (!s) return "never";
  const days = Math.round((Date.now() - new Date(s).getTime()) / 864e5);
  return days <= 0 ? "today" : days + "d ago";
}

export const BAND_WORD: Record<HealthBand, string> = { green: "Healthy", yellow: "Watch", red: "At risk" };
export const bandWord = (band: string | null | undefined): string => (band ? (BAND_WORD[band as HealthBand] ?? "") : "");

/** Color class for a 0–100 score: green ≥ 70, yellow ≥ 50, red below. */
export function tone(score: Num): string {
  if (score == null) return "";
  const n = Number(score);
  return n >= 70 ? "c-green" : n >= 50 ? "c-yellow" : "c-red";
}

/** "needs_work" → "Needs work". */
export function label(s: string | null | undefined): string {
  return s ? String(s).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "—";
}

const SEGMENT: Record<string, string> = { smb: "SMB", mid_market: "Mid-market", enterprise: "Enterprise", strategic: "Strategic" };
export const seg = (s: string | null | undefined): string => (s && SEGMENT[s]) || label(s);

/** A health metric's value, formatted by what the metric is. */
export function fmtVal(metric: string, v: Num): string {
  if (v == null) return "—";
  const n = Number(v);
  if (/pct|rate|utilization/.test(metric)) return pct(n);
  if (/engaged/.test(metric)) return n ? "Yes" : "No";
  if (/csat/.test(metric)) return n.toFixed(1) + " / 5";
  if (/days/.test(metric)) return Math.round(n) + " days";
  return String(Math.round(n * 10) / 10);
}

export const ACCOUNT_ID = /^acct_[A-Za-z0-9_-]{1,64}$/;

/** Warehouse-supplied links: only https URLs are ever rendered as links. */
export function safeUrl(u: string | null | undefined): string | null {
  return u && /^https:\/\//i.test(u) ? u : null;
}
