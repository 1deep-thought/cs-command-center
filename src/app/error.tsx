"use client";

import { useEffect } from "react";
import { PAGE_SHELL } from "@/components/renewals/layout";

const START_CMD = "uv run uvicorn api.index:app --port 8000";

export default function RenewalsError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <main className={PAGE_SHELL}>
      <div
        role="alert"
        className="max-w-xl rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
          Couldn&apos;t load renewals
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          The Python API is probably not running. Start it from the repo root:
        </p>
        <code className="mt-2 block rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 font-mono text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          {START_CMD}
        </code>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="h-7 rounded-md border border-zinc-200 px-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Try again
          </button>
          {digest ? (
            <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
              digest {digest}
            </span>
          ) : null}
        </div>
      </div>
    </main>
  );
}
