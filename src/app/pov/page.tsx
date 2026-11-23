import type { Metadata } from "next";
import { Suspense } from "react";
import { POV_SHELL } from "@/components/pov/layout";
import { PovList } from "@/components/pov/list";
import { PovListSkeleton } from "@/components/pov/skeleton";

export const metadata: Metadata = { title: "Proof of Value · CS Command Center" };

// Proof of Value plans (Delphina staff). The list reads an uncached API, so it streams in.
export default function Page() {
  return (
    <main className={POV_SHELL}>
      <Suspense fallback={<PovListSkeleton />}>
        <PovList />
      </Suspense>
    </main>
  );
}
