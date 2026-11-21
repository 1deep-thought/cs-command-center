import { PAGE_SHELL } from "@/components/renewals/layout";
import { RenewalsPageSkeleton } from "@/components/renewals/skeleton";

export default function Loading() {
  return (
    <main className={PAGE_SHELL}>
      <RenewalsPageSkeleton />
    </main>
  );
}
