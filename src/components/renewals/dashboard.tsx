import { NoAccessCard, SignInCard, SignOutButton } from "@/components/auth/sign-in";
import { getRenewals } from "@/lib/api";
import { AuthRequiredError, NotAuthorizedError } from "@/lib/auth";
import type { RenewalsResponse } from "@/types/renewals";
import { RenewalsEmpty } from "./empty-state";
import { pluralize } from "./format";
import { RenewalsHeader } from "./header";
import { firstParam, parseWindow } from "./href";
import { KpiStrip } from "./kpi-strip";
import { RenewalsTable } from "./renewals-table";

export type RenewalsSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

// Async server component: reads request-time searchParams and the uncached
// API fetch. Must render inside a <Suspense> boundary (cacheComponents).
export async function RenewalsDashboard({
  searchParams,
}: {
  searchParams: RenewalsSearchParams;
}) {
  const sp = await searchParams;
  let data: RenewalsResponse;
  try {
    data = await getRenewals({
      window: parseWindow(firstParam(sp.window)),
      owner: firstParam(sp.owner),
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) return <SignInCard />;
    if (error instanceof NotAuthorizedError) return <NoAccessCard />;
    throw error;
  }
  const { summary, accounts, owners } = data;
  const ownerName =
    owners.find((o) => o.owner_id === summary.owner_filter)?.owner_name ?? null;

  return (
    <>
      <RenewalsHeader data={data} />
      <KpiStrip summary={summary} />
      {accounts.length === 0 ? (
        <RenewalsEmpty
          window={summary.window}
          owner={summary.owner_filter}
          ownerName={ownerName}
        />
      ) : (
        <RenewalsTable accounts={accounts} />
      )}
      <div className="flex items-center justify-between gap-3">
      <p className="h-4 text-[11px] leading-4 text-zinc-500 tabular-nums dark:text-zinc-400">
        {pluralize(accounts.length, "account")} · sorted by past due, band, renewal date, ARR ·
        probability config {summary.probability_config_version}
      </p>
      <SignOutButton />
      </div>
    </>
  );
}
