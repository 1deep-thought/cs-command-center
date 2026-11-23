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
