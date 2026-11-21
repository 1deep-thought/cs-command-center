// Shared geometry so the real page, loading skeleton, and error state line up
// pixel-for-pixel. Change a size here and every state follows.

export const PAGE_SHELL =
  "mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 py-5";

export const HEADER_ROW = "flex min-h-7 flex-wrap items-center gap-x-4 gap-y-2";
export const CONTROL_H = "h-7";

export const KPI_GRID =
  "grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800";
export const KPI_CELL = "flex flex-col bg-white px-4 py-3 dark:bg-zinc-950";
export const KPI_LABEL = "h-4 text-xs leading-4 text-zinc-500 dark:text-zinc-400";
export const KPI_VALUE =
  "mt-1 h-8 text-2xl leading-8 font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50";
export const KPI_FOOT = "mt-1 flex h-4 items-center gap-1.5 text-xs leading-4 tabular-nums";

export const TABLE_FRAME =
  "rounded-md border border-zinc-200 dark:border-zinc-800";
export const TABLE = "w-full min-w-[1080px] table-fixed border-collapse text-[13px]";
export const ROW =
  "h-12 border-t border-zinc-100 first:border-t-0 dark:border-zinc-800/70";
export const CELL = "px-3 py-1.5 align-middle";

export const SKELETON_BLOCK = "animate-pulse rounded-sm bg-zinc-100 dark:bg-zinc-800/70";
