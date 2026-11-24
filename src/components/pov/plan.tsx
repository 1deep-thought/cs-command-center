import Link from "next/link";
import { NoAccessCard, SignInCard } from "@/components/auth/sign-in";
import { AuthRequiredError, NotAuthorizedError } from "@/lib/auth";
import { getAccountBook } from "@/lib/accounts-api";
import { getPlan } from "@/lib/pov-api";
import type { PlanView } from "@/types/pov-items";
import { CARD, LINK, MUTED } from "./layout";
import { PlanClient } from "./plan-client";
import type { AccountOption } from "./plan-details";

// Async server component: reads the route param and an uncached API fetch, so it must
// render inside <Suspense>.
export async function PovPlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let plan: PlanView | null;
  let accounts: AccountOption[] | null;
  try {
    // Accounts only feed the "Customer account" picker: the plan must open without them.
    [plan, accounts] = await Promise.all([
      getPlan(id),
      getAccountBook()
        .then((book) => book.accounts.map(({ account_id, account_name }) => ({ account_id, account_name })))
        .catch(() => null),
    ]);
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

  // Keyed on the PoV so moving between plans never carries one plan's edits into another.
  return <PlanClient key={plan.pov.pov_id} plan={plan} accounts={accounts} />;
}
