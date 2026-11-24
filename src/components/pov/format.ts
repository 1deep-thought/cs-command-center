// Display formatters for the PoV pages. Pure and deterministic (no clock, no locale lookups
// beyond en-US), so server and client render the same text.

export const DASH = "—";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function parts(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return MONTHS[m - 1] && d >= 1 && d <= 31 ? { y, m, d } : null;
}

/** "2027-01-12" → "Jan 12, 2027". Calendar date as written; no timezone shift. */
export function formatDate(iso: string | null | undefined): string {
  const p = parts(iso);
  return p ? `${MONTHS[p.m - 1]} ${p.d}, ${p.y}` : DASH;
}

/** "2027-01-12" → "Jan 12". */
export function formatDay(iso: string | null | undefined): string {
  const p = parts(iso);
  return p ? `${MONTHS[p.m - 1]} ${p.d}` : DASH;
}

/** Whole days from one calendar date to another, or null when either is missing. */
export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = parts(from);
  const b = parts(to);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** Money is stored in minor units. 25_000_000 USD cents → "$250K"; 1_250_000_00 → "$1.3M". */
export function formatMoney(minor: number | null | undefined, currency: string): string {
  if (typeof minor !== "number" || !Number.isFinite(minor)) return DASH;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(minor / 100);
  } catch {
    return `${Math.round(minor / 100).toLocaleString("en-US")} ${currency}`; // unknown currency code
  }
}

/** "$100K–$250K", or one figure when both ends are equal. */
export function formatRange(low: number | null | undefined, high: number | null | undefined, currency: string): string {
  if (typeof low !== "number" || typeof high !== "number") return DASH;
  return low === high ? formatMoney(low, currency) : `${formatMoney(low, currency)}–${formatMoney(high, currency)}`;
}

/** 25 → "25", 2.5 → "2.5": criterion targets without trailing zeros. */
export function formatNumber(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return DASH;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "sam@acme.com" → "sam". */
export function localPart(email: string): string {
  return email.split("@")[0] || email;
}

/** What a person types for money: "250k", "1.2m", "$1,200,000" → minor units, or null if unreadable. */
export function parseMoney(text: string): number | null {
  const match = /^\$?\s*([0-9][0-9,]*\.?[0-9]*|\.[0-9]+)\s*([kmb])?$/i.exec(text.trim());
  if (!match) return null;
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[(match[2] ?? "").toLowerCase()] ?? 1;
  const minor = Math.round(Number(match[1].replace(/,/g, "")) * scale * 100);
  return Number.isFinite(minor) && minor >= 0 && minor <= 1e12 ? minor : null;
}

/** Minor units as a person would type them, without losing anything: 25_000_000 → "250k",
 * 120_000_000 → "1.2m", 123_456_700 → "1234567". parseMoney reads every result back exactly. */
export function moneyInput(minor: number | null | undefined): string {
  if (typeof minor !== "number") return "";
  const units = minor / 100;
  if (units >= 1e6 && Number.isInteger(units / 1e3)) return `${units / 1e6}m`;
  if (units >= 1e3 && Number.isInteger(units)) return `${units / 1e3}k`;
  return String(units);
}

/** "2027-01-04" plus 15 days → "2027-01-19". Null if the date is unreadable. */
export function addDays(iso: string | null | undefined, days: number): string | null {
  const p = parts(iso);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m - 1, p.d + days)).toISOString().slice(0, 10);
}

/** The plan's score so far: sum of weight x score / 100 over the criteria that have a result. */
export function planScore(criteria: { weight_pct: number; score: number | null }[]): {
  /** Null until every criterion has a result. */
  score: number | null;
  missing: number;
} {
  const missing = criteria.filter((c) => c.score === null).length;
  if (criteria.length === 0 || missing > 0) return { score: null, missing };
  // Sum first, then round half up to one decimal: the same as weighted_score in pov_rules.py.
  const total = criteria.reduce((t, c) => t + c.weight_pct * (c.score ?? 0), 0);
  return { score: Math.round(total / 10) / 10, missing: 0 };
}

/** What the thresholds agreed at lock say about a score. */
export function suggestedDecision(score: number, go: number, noGo: number): "go" | "extend" | "no_go" {
  return score >= go ? "go" : score < noGo ? "no_go" : "extend";
}

/** Delphina's investment in whole US dollars: "$7,800". Not rounded further, so the rows of a
 * list always add up to its total (the figures are whole hours x a round hourly value anyway).
 * Shown with "about" wherever a prospect may see it: it is an estimate. */
export function formatInvestment(minor: number | null | undefined): string {
  if (typeof minor !== "number" || !Number.isFinite(minor)) return DASH;
  const dollars = Math.round(minor / 100);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(dollars);
}
