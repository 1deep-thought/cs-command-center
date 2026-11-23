import { POV_SHELL } from "@/components/pov/layout";
import { PovListSkeleton } from "@/components/pov/skeleton";

export default function Loading() {
  return (
    <main className={POV_SHELL}>
      <PovListSkeleton />
    </main>
  );
}
