import type { Metadata } from "next";
import { Suspense } from "react";
import { POV_SHELL } from "@/components/pov/layout";
import { PovPlan } from "@/components/pov/plan";
import { PovPlanSkeleton } from "@/components/pov/skeleton";

export const metadata: Metadata = { title: "PoV plan · CS Command Center" };

// One PoV plan. The route param and the plan are request-time data, so both are read inside
// the <Suspense> boundary (cacheComponents).
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className={POV_SHELL}>
      <Suspense fallback={<PovPlanSkeleton />}>
        <PovPlan params={params} />
      </Suspense>
    </main>
  );
}
