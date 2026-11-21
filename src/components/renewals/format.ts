// Pure display formatters for the renewals view. No scoring logic lives here.
// Every formatter takes nullable input and returns "—" for null/non-finite
// values so the UI never renders NaN, Infinity, or a fake 0.

export const DASH = "—";
const MINUS = "−";

export function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function signOf(v: number): string {
  if (v > 0) return "+";
  if (v < 0) return MINUS;
  return "";
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function usdBody(abs: number): string {
  if (abs >= 999_500) {
    const m = abs / 1_000_000;
    return `$${trimZero(m.toFixed(m >= 100 ? 0 : 1))}M`;
  }
  if (abs >= 999.5) {
    const k = abs / 1_000;
    return `$${k >= 10 ? Math.round(k) : trimZero(k.toFixed(1))}k`;
  }
  return `$${Math.round(abs)}`;
}

/** $1.2M, $148k, $9.5k, $640. Negative values get a true minus sign. */
export function formatUsdCompact(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  const body = usdBody(Math.abs(v));
  return v < 0 ? `${MINUS}${body}` : body;
}

/** +$12k, −$20k, $0. */
export function formatUsdSigned(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  return `${signOf(v)}${usdBody(Math.abs(v))}`;
}

/** Fraction → percent: 0.412 → "41%". */
export function formatPct(fraction: number | null | undefined, digits = 0): string {
  if (!isNum(fraction)) return DASH;
  return `${trimZero((fraction * 100).toFixed(digits))}%`;
}

/** Fraction → signed percent: −0.32 → "−32%", 0.051 → "+5%". */
export function formatPctSigned(fraction: number | null | undefined): string {
  if (!isNum(fraction)) return DASH;
  const rounded = Math.round(fraction * 100);
  if (rounded === 0) return "0%";
  return `${signOf(rounded)}${Math.abs(rounded)}%`;
}

/** Percentage points (already in pts): 1.24 → "+1.2 pts", −6 → "−6 pts". */
export function formatPtsSigned(pts: number | null | undefined, digits = 1): string {
  if (!isNum(pts)) return DASH;
  const fixed = trimZero(Math.abs(pts).toFixed(digits));
  if (Number(fixed) === 0) return "0 pts";
  return `${signOf(pts)}${fixed} pts`;
}

/** Health score delta: −14 → "↓14", 3 → "↑3", 0 → "±0". */
export function formatScoreDelta(d: number | null | undefined): string {
  if (!isNum(d)) return DASH;
  const r = Math.round(d);
  if (r === 0) return "±0";
  return r > 0 ? `↑${r}` : `↓${Math.abs(r)}`;
}

export function formatCount(n: number | null | undefined): string {
  if (!isNum(n)) return DASH;
  return Math.round(n).toLocaleString("en-US");
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2026-11-19" → "Nov 19". Parsed as a calendar date; no timezone shift. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return DASH;
  const month = MONTHS[Number(m[2]) - 1];
  const day = Number(m[3]);
  if (!month || !Number.isFinite(day)) return DASH;
  return `${month} ${day}`;
}

export function formatDays(n: number | null | undefined): string {
  if (!isNum(n)) return DASH;
  return `${Math.round(n)}d`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

// ---- Delta tone -----------------------------------------------------------

/** Which direction is good for a metric. "none" = direction carries no meaning. */
export type GoodDirection = "up" | "down" | "none";
export type Tone = "good" | "bad" | "neutral" | "muted";

export function deltaTone(v: number | null | undefined, good: GoodDirection): Tone {
  if (!isNum(v) || v === 0) return "muted";
  if (good === "none") return "neutral";
  const isUp = v > 0;
  return isUp === (good === "up") ? "good" : "bad";
}

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  bad: "text-rose-700 dark:text-rose-400",
  neutral: "text-zinc-600 dark:text-zinc-400",
  muted: "text-zinc-400 dark:text-zinc-500",
};
