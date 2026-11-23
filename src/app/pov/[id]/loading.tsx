import { POV_SHELL } from "@/components/pov/layout";
import { PovPlanSkeleton } from "@/components/pov/skeleton";

export default function Loading() {
  return (
    <main className={POV_SHELL}>
      <PovPlanSkeleton />
    </main>
  );
}
