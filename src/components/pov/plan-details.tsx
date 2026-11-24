"use client";

import { useId, useState } from "react";
import type { PovOwnerView } from "@/types/pov";
import { BAD, BUTTON, INPUT, MUTED, PRIMARY } from "./layout";

export type AccountOption = { account_id: string; account_name: string };

const LABEL = "flex min-w-0 flex-col gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The plan's own details: what it is called, who it is for, which customer account it became,
 * and who owns it. Title and prospect are part of the plan, so they freeze at lock; the account
 * link and the owner can change at any time. One Save sends only what changed. */
export function PlanDetails({
  pov,
  accounts,
  frozen,
  onSave,
  onClose,
}: {
  pov: PovOwnerView;
  /** Customer accounts to choose from, or null when the account data couldn't be read. */
  accounts: AccountOption[] | null;
  frozen: boolean;
  onSave: (changes: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(pov.title);
  const [prospect, setProspect] = useState(pov.prospect_name);
  const [account, setAccount] = useState(pov.account_id ?? "");
  const [owner, setOwner] = useState(pov.owner_email);
  const [error, setError] = useState<string | null>(null);

  // A link to an account that is no longer in the book still shows, so saving never drops it silently.
  const options = accounts ? [...accounts].sort((a, b) => a.account_name.localeCompare(b.account_name)) : [];
  const unknown = pov.account_id && !options.some((a) => a.account_id === pov.account_id) ? pov.account_id : null;

  function save() {
    const changes: Record<string, unknown> = {};
    const t = title.trim();
    const p = prospect.trim();
    const o = owner.trim().toLowerCase();
    if (!frozen) {
      if (!t || !p) return setError("Title and prospect can't be empty.");
      if (t.length > 120 || p.length > 120) return setError("Title and prospect can be at most 120 characters.");
      if (t !== pov.title) changes.title = t;
      if (p !== pov.prospect_name) changes.prospect_name = p;
    }
    if (!EMAIL.test(o)) return setError("Owner must be an email address.");
    if (o !== pov.owner_email.trim().toLowerCase()) changes.owner_email = o;
    if (accounts && account !== (pov.account_id ?? "")) changes.account_id = account || null;
    if (Object.keys(changes).length > 0) onSave(changes);
    onClose();
  }

  return (
    <form
      aria-label="Plan details"
      className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={LABEL} htmlFor={`${id}-title`}>
          Title
          <input id={`${id}-title`} className={INPUT} value={title} maxLength={120} disabled={frozen} onChange={(e) => setTitle(e.target.value)} autoFocus={!frozen} />
        </label>
        <label className={LABEL} htmlFor={`${id}-prospect`}>
          Prospect
          <input id={`${id}-prospect`} className={INPUT} value={prospect} maxLength={120} disabled={frozen} onChange={(e) => setProspect(e.target.value)} />
        </label>
        <label className={LABEL} htmlFor={`${id}-account`}>
          Customer account
          <select id={`${id}-account`} className={INPUT} value={account} disabled={!accounts} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Not a customer yet</option>
            {unknown ? <option value={unknown}>{unknown} (not in the account list)</option> : null}
            {options.map((a) => (
              <option key={a.account_id} value={a.account_id}>
                {a.account_name}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL} htmlFor={`${id}-owner`}>
          Owner
          <input id={`${id}-owner`} type="email" className={INPUT} value={owner} maxLength={254} onChange={(e) => setOwner(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" className={PRIMARY}>
          Save details
        </button>
        <button type="button" className={BUTTON} onClick={onClose}>
          Cancel
        </button>
        {error ? (
          <span role="alert" className={`text-xs ${BAD}`}>
            {error}
          </span>
        ) : (
          <span className={`text-xs ${MUTED}`}>
            {frozen ? "The plan is locked, so its title and prospect are fixed. " : ""}
            {accounts ? "" : "The account list couldn't be loaded, so the account link can't be changed right now. "}
            Only the owner or an admin can hand a plan to someone else.
          </span>
        )}
      </div>
    </form>
  );
}
