"use client";

import { useRef, useState, type ReactNode } from "react";
import { BAD, MUTED } from "./layout";

// Inline controls for the plan tables. They look like text until hovered or focused, save on
// blur or Enter, and Esc puts the saved value back. With `editable` false they render plain text.

export const FIELD =
  "h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 text-[13px] text-inherit placeholder:text-zinc-400 hover:border-zinc-200 focus:border-zinc-400 focus:bg-white focus:outline-none dark:hover:border-zinc-700 dark:focus:border-zinc-500 dark:focus:bg-zinc-950";
const PULL = "-mx-1.5"; // so the text lines up with read-only cells

export function EditText({
  value,
  onCommit,
  editable,
  label,
  placeholder,
  required = false,
  maxLength,
  className = "",
  type = "text",
}: {
  value: string;
  /** Return false when the value was refused, and the field goes back to what was saved. */
  onCommit: (value: string) => boolean | void;
  editable: boolean;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
  type?: "text" | "email";
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(value);
  const cancelled = useRef(false);
  if (saved !== value) {
    // The saved value changed underneath (our own save, or a colleague's): show it.
    setSaved(value);
    setDraft(value);
  }
  if (!editable) {
    return <span className={`block truncate ${value ? "" : MUTED} ${className}`}>{value || "—"}</span>;
  }
  return (
    <input
      type={type}
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return; // Enter that confirms an IME composition is not a save
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const next = draft.trim();
        if (cancelled.current || next === value || (required && !next)) {
          cancelled.current = false;
          setDraft(value);
          return;
        }
        if (onCommit(next) === false) setDraft(value);
      }}
      className={`${FIELD} ${PULL} ${className}`}
    />
  );
}

export function Pick<T extends string>({
  value,
  options,
  onChange,
  editable,
  label,
  empty = "—",
  className = "",
}: {
  value: T | null;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T | null) => void;
  editable: boolean;
  label: string;
  /** Text of the "nothing chosen" option. */
  empty?: string;
  className?: string;
}) {
  if (!editable) {
    const current = options.find((o) => o.value === value);
    return <span className={`block truncate ${current ? "" : MUTED}`}>{current?.label ?? "—"}</span>;
  }
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as T | null)}
      className={`${FIELD} ${PULL} ${value ? "" : "text-zinc-400"} ${className}`}
    >
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Two clicks to remove a row: the first asks, the second does it. Moving away cancels. */
export function Remove({ onRemove, label }: { onRemove: () => void; label: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <button
      type="button"
      aria-label={asking ? `Confirm: remove ${label}` : `Remove ${label}`}
      onClick={() => (asking ? onRemove() : setAsking(true))}
      onBlur={() => setAsking(false)}
      className={`h-6 rounded px-1 text-xs focus-visible:outline-2 focus-visible:outline-zinc-400 ${
        asking ? `font-medium ${BAD}` : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      }`}
    >
      {asking ? "Remove?" : "×"}
    </button>
  );
}

/** Last row of a table: type a name, press Enter, and the row exists. */
export function AddRow({
  span,
  placeholder,
  onAdd,
  full,
}: {
  span: number;
  placeholder: string;
  onAdd: (text: string) => void;
  /** Set when the table is at its limit: shown instead of the input. */
  full?: string;
}) {
  const [text, setText] = useState("");
  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-800/70">
      <td colSpan={span} className="h-9 px-3">
        {full ? (
          <span className={`text-xs ${MUTED}`}>{full}</span>
        ) : (
          <input
            aria-label={placeholder}
            placeholder={placeholder}
            maxLength={120}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && text.trim()) {
                onAdd(text.trim());
                setText("");
              }
              if (e.key === "Escape") setText("");
            }}
            className={`${FIELD} ${PULL} text-xs`}
          />
        )}
      </td>
    </tr>
  );
}

export function Chip({ children, onRemove, label }: { children: ReactNode; onRemove?: () => void; label: string }) {
  return (
    <span className="inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded border border-zinc-200 px-1.5 text-[11px] leading-none font-medium whitespace-nowrap text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="-mr-0.5 text-zinc-400 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:hover:text-zinc-200"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
