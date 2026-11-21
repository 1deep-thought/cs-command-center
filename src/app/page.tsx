import { Suspense } from "react";
import { RenewalsDashboard, type RenewalsSearchParams } from "@/components/renewals/dashboard";
import { PAGE_SHELL } from "@/components/renewals/layout";
import { RenewalsPageSkeleton } from "@/components/renewals/skeleton";

// Customer Health & Renewals (spec: docs/specs/health-renewals.md).
// URL state: ?window=next_90d|days_91_180&owner=<hubspot owner_id>
export default function Page({
  searchParams,
}: {
  searchParams: RenewalsSearchParams;
}) {
  return (
    <main className={PAGE_SHELL}>
      <Suspense fallback={<RenewalsPageSkeleton />}>
        <RenewalsDashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
