"use client";

import { useEffect, useId, useState } from "react";
import type { PovOwnerView, StaffMember, Team, TeamRole } from "@/types/pov";
import { TEAM_ROLE_LABEL } from "./labels";
import { BAD, BUTTON, INPUT, MUTED, PRIMARY } from "./layout";

export type AccountOption = { account_id: string; account_name: string };

const LABEL = "flex min-w-0 flex-col gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400";
const ROLES: readonly TeamRole[] = ["ae", "se"];

/** The plan's own details: what it is called, who it is for, which customer account it became,
 * and who at Delphina runs it. Title and prospect are part of the plan, so they freeze at lock;
 * the account link and the team can change at any time. One Save sends only what changed. */
export function PlanDetails({
  pov,
  team,
  accounts,
  frozen,
  onSave,
  onTeam,
  onClose,
}: {
  pov: PovOwnerView;
  team: Team;
  /** Assign (or clear, with null) the Account Executive, the Solution Engineer, or both. */
  onTeam: (changes: Partial<Team>) => void;
  /** Customer accounts to choose from: undefined while loading, null when they couldn't be read. */
  accounts: AccountOption[] | null | undefined;
  frozen: boolean;
  onSave: (changes: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(pov.title);
  const [prospect, setProspect] = useState(pov.prospect_name);
  const [account, setAccount] = useState(pov.account_id ?? "");
  const [people, setPeople] = useState<Team>(team);
  const [error, setError] = useState<string | null>(null);

  // Delphina people who can be assigned: undefined while loading, null if the list couldn't be read.
  const [staff, setStaff] = useState<StaffMember[] | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch("/api/pov/staff", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<StaffMember[]>) : null))
      .then(
        (list) => live && setStaff(list),
        () => live && setStaff(null),
      );
    return () => {
      live = false;
    };
  }, []);

  // A link to an account that is no longer in the book still shows, so saving never drops it silently.
  const options = accounts ? [...accounts].sort((a, b) => a.account_name.localeCompare(b.account_name)) : [];
  const unknown = pov.account_id && !options.some((a) => a.account_id === pov.account_id) ? pov.account_id : null;

  function save() {
    const changes: Record<string, unknown> = {};
    const t = title.trim();
    const p = prospect.trim();
    if (!frozen) {
      if (!t || !p) return setError("Title and prospect can't be empty.");
      if (t.length > 120 || p.length > 120) return setError("Title and prospect can be at most 120 characters.");
      if (t !== pov.title) changes.title = t;
      if (p !== pov.prospect_name) changes.prospect_name = p;
    }
    if (accounts && account !== (pov.account_id ?? "")) changes.account_id = account || null;
    if (Object.keys(changes).length > 0) onSave(changes);
    const moved: Partial<Team> = {};
    for (const role of ROLES) if (people[role] !== team[role]) moved[role] = people[role];
    if (Object.keys(moved).length > 0) onTeam(moved); // one request for both roles
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
        // Esc on the account list only closes the list.
        if (event.key === "Escape" && !(event.target instanceof HTMLSelectElement)) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            {unknown ? <option value={unknown}>{accounts ? `${unknown} (not in the account list)` : "Current account"}</option> : null}
            {options.map((a) => (
              <option key={a.account_id} value={a.account_id}>
                {a.account_name}
              </option>
            ))}
          </select>
        </label>
        {ROLES.map((role) => {
          const current = people[role];
          // Someone assigned who is no longer in the staff list still shows, so saving never drops them silently.
          const listed = staff?.some((s) => s.email === current) ?? false;
          return (
            <label key={role} className={LABEL} htmlFor={`${id}-${role}`}>
              {TEAM_ROLE_LABEL[role]}
              <select
                id={`${id}-${role}`}
                className={INPUT}
                value={current ?? ""}
                disabled={!staff}
                onChange={(e) => setPeople((p) => ({ ...p, [role]: e.target.value || null }))}
              >
                <option value="">Not assigned</option>
                {current && !listed ? <option value={current}>{current}</option> : null}
                {(staff ?? []).map((s) => (
                  <option key={s.email} value={s.email}>
                    {s.email}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
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
            {accounts === undefined
              ? "Loading the account list… "
              : accounts === null
                ? "The account list couldn't be loaded, so the account link can't be changed right now. "
                : ""}
            {staff === undefined
              ? "Loading the people list… "
              : staff === null
                ? "The people list couldn't be loaded, so the team can't be changed right now. "
                : ""}
            The Account Executive, the Solution Engineer and admins are the people who can change this plan, so taking
            yourself off it ends your own access.
          </span>
        )}
      </div>
    </form>
  );
}
