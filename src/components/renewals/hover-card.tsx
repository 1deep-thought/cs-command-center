import type { ReactNode } from "react";

// CSS-only hover/focus card. No client JS: shows on pointer hover and on
// keyboard focus of the trigger button.
export function HoverCard({
  id,
  trigger,
  children,
  triggerLabel,
}: {
  id: string;
  trigger: ReactNode;
  children: ReactNode;
  triggerLabel?: string;
}) {
  return (
    <span className="group/hc relative inline-flex max-w-full">
      <button
        type="button"
        aria-describedby={id}
        aria-label={triggerLabel}
        className="inline-flex max-w-full cursor-default items-center rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
      >
        {trigger}
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute top-full left-0 z-30 mt-1 w-60 rounded-md border border-zinc-200 bg-white p-2.5 text-xs text-zinc-700 opacity-0 shadow-sm transition-opacity duration-75 group-focus-within/hc:visible group-focus-within/hc:opacity-100 group-hover/hc:visible group-hover/hc:opacity-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      >
        {children}
      </span>
    </span>
  );
}
