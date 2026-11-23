"use client";

import { SignOutButton } from "@/components/auth/sign-in";
import type { PlanView } from "@/types/pov-items";
import { BAD, BUTTON, MUTED } from "./layout";
import { PlanHeader } from "./plan-header";
import { Criteria, LockedBanner, PainPoints, Stakeholders, Summary, Timeline } from "./sections";
import { usePlanStore } from "./use-plan-store";

/** The plan page body. Holds the plan in the browser so edits show at once and save in the background. */
export function PlanClient({ plan: initial }: { plan: PlanView }) {
  const { plan, pending, syncing, notice, dismiss, editor, resync } = usePlanStore(initial);
  const { pov, pain_points, stakeholders, criteria, milestones, links, readiness } = plan;
  const edit = pov.status === "draft" || pov.status === "collaborating" ? editor : null;

  const names: Record<string, string> = {};
  for (const p of pain_points) names[p.pain_point_id] = p.title;
  for (const s of stakeholders) names[s.stakeholder_id] = s.name;
  for (const c of criteria) names[c.criterion_id] = c.statement.length > 60 ? `${c.statement.slice(0, 57)}…` : c.statement;

  return (
    <>
      <PlanHeader
        pov={pov}
        readiness={readiness}
        names={names}
        stale={pending > 0 || syncing}
        saving={pending}
        onChanged={resync}
      >
        {notice ? (
          <p role="alert" className={`mt-1.5 flex items-center justify-end gap-2 text-xs ${BAD}`}>
            {notice}
            <button type="button" onClick={dismiss} className={BUTTON}>
              Dismiss
            </button>
          </p>
        ) : null}
      </PlanHeader>
      <LockedBanner pov={pov} />
      <Summary plan={plan} />
      <Stakeholders items={stakeholders} edit={edit} />
      <PainPoints items={pain_points} links={links} currency={pov.currency} edit={edit} />
      <Criteria items={criteria} links={links} painPoints={pain_points} stakeholders={stakeholders} edit={edit} />
      <Timeline items={milestones} edit={edit} />
      <div className="flex h-4 items-center justify-between gap-3">
        <p className={`min-w-0 truncate text-[11px] leading-4 ${MUTED}`}>
          Owner {pov.owner_email}
          {edit ? " · changes save on Enter or when you leave a field; Esc undoes what you typed" : ""}
        </p>
        <SignOutButton variant="link" />
      </div>
    </>
  );
}
