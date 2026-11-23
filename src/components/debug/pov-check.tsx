"use client";

import { useState } from "react";

type Result = {
  pov_id: string | null;
  all_ok: boolean;
  steps: { step: string; status: number; ok: boolean; note?: string }[];
};

export function PovCheck({ endpoint = "/api/debug/pov-check", label = "Run PoV API check" }: { endpoint?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (res.status === 401) setError("Not signed in (or the session expired). Sign in on the home page, then try again.");
      else if (!res.ok) setError(`Check failed to run (HTTP ${res.status}).`);
      else setResult((await res.json()) as Result);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Temporary. Creates a test PoV titled &quot;zz-debug …&quot; and exercises the pain point and stakeholder
        endpoints as you.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="h-7 rounded-md border border-zinc-200 px-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        {busy ? "Running…" : label}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="space-y-2 text-xs">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {result.all_ok ? "All steps passed" : "Some steps failed"}
            {result.pov_id ? <span className="ml-2 font-normal text-zinc-500">PoV {result.pov_id}</span> : null}
          </p>
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {result.steps.map((s) => (
              <li key={s.step} className="px-3 py-2">
                <span className={s.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {s.ok ? "Pass" : "Fail"}
                </span>{" "}
                {s.step} <span className="text-zinc-500">(HTTP {s.status})</span>
                {s.note ? <pre className="mt-1 whitespace-pre-wrap break-all text-zinc-500">{s.note}</pre> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
