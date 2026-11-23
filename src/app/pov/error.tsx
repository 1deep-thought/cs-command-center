"use client";

import { useEffect } from "react";
import { BUTTON, CARD, MUTED, POV_SHELL } from "@/components/pov/layout";

export default function PovError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={POV_SHELL}>
      <div role="alert" className={CARD}>
        <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Couldn&apos;t load this page</p>
        <p className={`mt-1 text-xs ${MUTED}`}>The PoV service didn&apos;t answer. Nothing was changed.</p>
        <div className="mt-3">
          <button type="button" onClick={() => retry()} className={BUTTON}>
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
