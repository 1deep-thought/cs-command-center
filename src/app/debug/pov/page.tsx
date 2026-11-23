import { PAGE_SHELL } from "@/components/renewals/layout";
import { PovCheck } from "@/components/debug/pov-check";

// Temporary smoke-test page for the PoV API. Delete with src/app/api/debug/pov-check.
export default function Page() {
  return (
    <main className={PAGE_SHELL}>
      <h1 className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">PoV API check</h1>
      <PovCheck />
      <div className="mt-6">
        <PovCheck endpoint="/api/debug/pov-check-links" label="Run milestones + links check" />
      </div>
    </main>
  );
}
