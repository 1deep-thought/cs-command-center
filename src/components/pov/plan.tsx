import Link from "next/link";
import { NoAccessCard, SignInCard, SignOutButton } from "@/components/auth/sign-in";
import { AuthRequiredError, NotAuthorizedError } from "@/lib/auth";
import { getPlan } from "@/lib/pov-api";
import type { PlanView } from "@/types/pov-items";
import { CARD, LINK, MUTED } from "./layout";
import { PlanHeader } from "./plan-header";
import { Criteria, LockedBanner, PainPoints, Stakeholders, Summary, Timeline } from "./sections";

// Async server component: reads the route param and an uncached API fetch, so it must
// render inside <Suspense>.
export async function PovPlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let plan: PlanView | null;
  try {
    plan = await getPlan(id);
  } catch (error) {
    if (error instanceof AuthRequiredError) return <SignInCard expired={error.expired} />;
    if (error instanceof NotAuthorizedError) return <NoAccessCard />;
    throw error;
  }
  if (plan === null) {
    return (
      <div className={CARD} role="alert">
        <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">No such PoV</p>
        <p className={`mt-1 text-xs ${MUTED}`}>
          It may have been removed, or the link is wrong.{" "}
          <Link href="/pov" className={LINK}>
            All PoV plans
          </Link>
        </p>
      </div>
    );
  }

  const { pov, pain_points, stakeholders, criteria, milestones, links, readiness } = plan;
  const names: Record<string, string> = {};
  for (const p of pain_points) names[p.pain_point_id] = p.title;
  for (const s of stakeholders) names[s.stakeholder_id] = s.name;
  for (const c of criteria) names[c.criterion_id] = c.statement.length > 60 ? `${c.statement.slice(0, 57)}…` : c.statement;

  return (
    <>
      {/* Keyed on the change counter: after any write the header starts fresh from the server's state. */}
      <PlanHeader key={pov.seq} pov={pov} readiness={readiness} names={names} />
      <LockedBanner pov={pov} />
      <Summary plan={plan} />
      <Stakeholders items={stakeholders} />
      <PainPoints items={pain_points} links={links} currency={pov.currency} />
      <Criteria items={criteria} links={links} painPoints={pain_points} stakeholders={stakeholders} />
      <Timeline items={milestones} />
      <div className="flex h-4 items-center justify-between gap-3">
        <p className={`min-w-0 truncate text-[11px] leading-4 ${MUTED}`}>Owner {pov.owner_email} · read-only view; editing comes next</p>
        <SignOutButton variant="link" />
      </div>
    </>
  );
}
