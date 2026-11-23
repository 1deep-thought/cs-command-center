"use client";

import { useRef, useState, type ReactNode } from "react";
import { ADD_ROW, BAD, FIELD, MUTED, PICK_INLINE } from "./layout";

// Inline controls for the plan tables. Fields carry a faint tint so the plan reads as editable;
// they save on blur or Enter, and Esc puts the saved value back. With `editable` false they
// render plain text.

const PULL = "-mx-1.5"; // so the text lines up with read-only cells
/** Full width unless the caller asked for a width: two width classes on one element would fight. */
const sized = (className: string) => (/(^|\s)w-/.test(className) ? className : `w-full ${className}`);

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
      className={`${FIELD} ${PULL} ${sized(className)}`}
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
  inline = false,
}: {
  value: T | null;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T | null) => void;
  editable: boolean;
  label: string;
  /** Text of the "nothing chosen" option. */
  empty?: string;
  className?: string;
  /** The small dashed "+ something" picker that sits next to chips. */
  inline?: boolean;
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
      className={
        inline
          ? `${PICK_INLINE} ${className}`
          : `${FIELD} ${PULL} cursor-pointer ${value ? "" : "text-zinc-500! dark:text-zinc-400!"} ${sized(className)}`
      }
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

/** Two clicks to remove a row: the first asks, the second does it. Moving away cancels.
 * Hidden until its row (a `group/row`) is hovered or focused, so the tables stay calm. */
export function Remove({ onRemove, label }: { onRemove: () => void; label: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <button
      type="button"
      aria-label={asking ? `Confirm: remove ${label}` : `Remove ${label}`}
      onClick={() => (asking ? onRemove() : setAsking(true))}
      onBlur={() => setAsking(false)}
      className={`h-6 rounded text-xs focus-visible:opacity-100! focus-visible:outline-2 focus-visible:outline-zinc-400 ${
        asking
          ? `px-1.5 font-medium ${BAD} bg-rose-50 dark:bg-rose-950/40`
          : "w-6 text-zinc-500 group-focus-within/row:opacity-100! group-hover/row:opacity-100! hover:bg-rose-50 [@media(hover:hover)]:opacity-0 hover:text-rose-700 dark:text-zinc-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
      }`}
    >
      {asking ? "Remove?" : "×"}
    </button>
  );
}

/** Last row of a table: an obvious "+ Add …" line. Type, press Enter, and the row exists. */
export function AddRow({
  span,
  label,
  onAdd,
  full,
}: {
  span: number;
  /** "Add pain point" */
  label: string;
  onAdd: (text: string) => void;
  /** Set when the table is at its limit: shown instead of the input. */
  full?: string;
}) {
  const [text, setText] = useState("");
  return (
    <tr className={ADD_ROW}>
      <td colSpan={span}>
        {full ? (
          <span className={`flex h-9 items-center px-3 text-xs ${MUTED}`}>{full}</span>
        ) : (
          <label className="flex h-9 cursor-text items-center gap-2 px-3">
            <span aria-hidden="true" className={`text-sm ${MUTED}`}>
              +
            </span>
            <input
              aria-label={label}
              placeholder={label}
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
              className="h-7 min-w-0 flex-1 bg-transparent text-[13px] font-medium placeholder:text-zinc-700 focus:outline-none dark:placeholder:text-zinc-300"
            />
            <span className={`text-[11px] opacity-0 group-focus-within:opacity-100 ${MUTED}`}>Enter to add</span>
          </label>
        )}
      </td>
    </tr>
  );
}

export function Chip({ children, onRemove, label }: { children: ReactNode; onRemove?: () => void; label: string }) {
  return (
    <span className="inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded border border-zinc-200 bg-zinc-100 px-1.5 text-[11px] leading-none font-medium whitespace-nowrap text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="-mr-0.5 text-zinc-500 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:text-zinc-400 dark:hover:text-rose-400"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
