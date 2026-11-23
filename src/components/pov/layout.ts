// Shared geometry for the Proof of Value pages, so real content, skeletons and empty
// states line up. Table, KPI and skeleton primitives come from the renewals layout.

export const POV_SHELL = "mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-6 py-5";
export const POV_TABLE = "w-full min-w-[920px] table-fixed border-collapse text-[13px]";
export const ROW_SM = "h-9 border-t border-zinc-100 first:border-t-0 dark:border-zinc-800/70";
export const TH =
  "h-8 border-b border-zinc-200 px-3 text-left text-[11px] font-medium whitespace-nowrap text-zinc-500 dark:border-zinc-800 dark:text-zinc-400";
export const SECTION_HEAD = "flex h-7 items-center gap-2";
export const SECTION_TITLE = "text-[13px] leading-7 font-semibold text-zinc-900 dark:text-zinc-50";
export const SECTION_COUNT = "text-xs tabular-nums text-zinc-500 dark:text-zinc-400";
// Rows are link targets from the readiness panel; the sticky header must not cover them.
export const ROW_ANCHOR = "scroll-mt-32 target:bg-amber-50 dark:target:bg-amber-950/30";
export const STICKY_HEAD =
  "sticky top-0 z-10 -mx-6 border-b border-zinc-200 bg-white/95 px-6 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95";
export const INPUT =
  "h-7 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
export const BUTTON =
  "h-7 rounded-md border border-zinc-200 px-2.5 text-xs font-medium whitespace-nowrap text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900";
export const PRIMARY =
  "h-7 rounded-md bg-zinc-900 px-2.5 text-xs font-medium whitespace-nowrap text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";
export const LINK =
  "text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-zinc-100";
export const BADGE =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-[11px] leading-none font-medium whitespace-nowrap";
export const MUTED = "text-zinc-500 dark:text-zinc-400";
export const WARN = "text-amber-700 dark:text-amber-400";
export const BAD = "text-rose-700 dark:text-rose-400";
export const GOOD = "text-emerald-700 dark:text-emerald-400";
export const CARD = "max-w-xl rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";

export const rowId = {
  pain_point: (id: string) => `pp-${id}`,
  stakeholder: (id: string) => `sh-${id}`,
  criterion: (id: string) => `cr-${id}`,
  milestone: (id: string) => `ms-${id}`,
} as const;
