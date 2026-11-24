// Shared geometry for the Proof of Value pages, so real content, skeletons and empty
// states line up. Table, KPI and skeleton primitives come from the renewals layout.

// Same width as the Renewals page, so the app bar and both pages share one left edge.
export const POV_SHELL = "mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 py-5";
export const POV_TABLE = "w-full min-w-[920px] table-fixed border-collapse text-[13px]";
export const ROW_SM = "h-9 border-t border-zinc-100 first:border-t-0 dark:border-zinc-800/70";
export const TH =
  "h-8 border-b border-zinc-200 bg-zinc-50 px-3 text-left text-[11px] font-medium whitespace-nowrap text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400";
export const SECTIONS = "flex flex-col gap-8 pt-2";
export const SECTION_HEAD = "flex h-8 items-center gap-2.5";
export const SECTION_TITLE = "text-sm leading-8 font-semibold tracking-tight text-zinc-900 dark:text-zinc-50";
// Rows are link targets from the readiness panel; the sticky header must not cover them.
export const ROW_ANCHOR = "scroll-mt-44 target:bg-amber-50 dark:target:bg-amber-950/30";
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

// Inline fields carry a faint tint at rest, so an editable plan reads as editable without
// turning into a form. Read-only plans render plain text instead. No width here: a field is
// full width unless its caller gives one (see `sized` in controls.tsx).
export const FIELD =
  "h-7 min-w-0 rounded border border-transparent bg-zinc-100/70 px-1.5 text-[13px] text-inherit placeholder:text-zinc-500 hover:border-zinc-300 hover:bg-zinc-100 focus:border-zinc-500 focus:bg-white focus:ring-2 focus:ring-zinc-900/10 focus:outline-none dark:bg-zinc-800/50 dark:placeholder:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:focus:border-zinc-400 dark:focus:bg-zinc-950 dark:focus:ring-zinc-100/15";
// Important, because FIELD sets the same properties.
export const FIELD_INVALID = "border-rose-400! bg-rose-50! dark:border-rose-500! dark:bg-rose-950/30!";
/** The small dashed "+ role" / "+ pain point" pickers that sit next to chips. */
export const PICK_INLINE =
  "h-5 w-auto max-w-[9rem] cursor-pointer rounded border border-dashed border-zinc-300 bg-transparent px-1 text-[11px] text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:border-zinc-600 dark:text-zinc-300 dark:hover:border-zinc-400";
export const ADD_ROW =
  "group border-t border-zinc-200 bg-zinc-50 focus-within:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus-within:bg-zinc-950";
/** Quiet glyph buttons (expand, remove, mark as left): readable at rest, not shouting. */
export const GLYPH = "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";

export const PILL =
  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap tabular-nums focus-visible:outline-2 focus-visible:outline-zinc-400";
export const TONE_WARN = "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
export const TONE_GOOD = "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
export const TONE_BAD = "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300";

export const STEPPER = "mt-1 flex h-6 items-center gap-2 text-xs";

export const TABS = "flex items-center gap-5 border-b border-zinc-200 dark:border-zinc-800";
export const TAB =
  "-mb-px inline-flex h-8 items-center border-b-2 border-transparent text-[13px] text-zinc-500 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:text-zinc-400 dark:hover:text-zinc-100";
export const TAB_ACTIVE =
  "-mb-px inline-flex h-8 items-center border-b-2 border-zinc-900 text-[13px] font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:border-zinc-100 dark:text-zinc-50";
export const SEG_WRAP = "inline-flex h-7 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700";
export const SEG =
  "inline-flex items-center rounded px-2 text-xs text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:text-zinc-400 dark:hover:text-zinc-100";
export const SEG_ACTIVE =
  "inline-flex items-center rounded bg-zinc-100 px-2 text-xs font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:bg-zinc-800 dark:text-zinc-50";

// The PoV list's columns. Here, in a plain module, because both the server-rendered skeleton
// and the client list need to call it.
export type ListColumn = { label: string; width?: number; align: string };
export function listColumns(showOwner: boolean): ListColumn[] {
  return [
    { label: "PoV", align: "text-left" },
    { label: "Status", width: 140, align: "text-left" },
    { label: "Decision by", width: 120, align: "text-left" },
    ...(showOwner ? [{ label: "Owner", width: 140, align: "text-left" }] : []),
    // Delphina's estimated team time on the PoV, as money. Staff-facing: the list is not for sharing.
    { label: "Delphina investment", width: 140, align: "text-right" },
    { label: "Updated", width: 110, align: "text-right" },
  ];
}
