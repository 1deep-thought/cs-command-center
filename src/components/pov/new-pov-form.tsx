"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PovOwnerView } from "@/types/pov";
import { BAD, INPUT, PRIMARY } from "./layout";

export function NewPovForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [prospect, setProspect] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per attempt at this plan: pressing the button again after a dropped connection
  // returns the plan already made instead of a second one.
  const [opId, setOpId] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !title.trim() || !prospect.trim()) return;
    const id = opId ?? crypto.randomUUID();
    setOpId(id);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pov", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op_id: id, title: title.trim(), prospect_name: prospect.trim() }),
      });
      if (res.status === 201) {
        const pov = (await res.json()) as PovOwnerView;
        router.push(`/pov/${pov.pov_id}`);
        return; // stay busy until the plan page takes over
      }
      if (res.status === 401) setError("Your session expired. Reload the page to sign in again.");
      else if (res.status === 422) setError("Check the title and prospect name (120 characters at most).");
      else setError("Couldn't create the plan. Try again; retrying is safe.");
    } catch {
      setError("Couldn't reach the server. Try again; retrying is safe.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="ml-auto flex flex-wrap items-center gap-2">
      {error ? (
        <p role="alert" className={`text-xs ${BAD}`}>
          {error}
        </p>
      ) : null}
      <input
        aria-label="PoV title"
        placeholder="PoV title"
        maxLength={120}
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setOpId(null);
        }}
        className={`${INPUT} w-56`}
      />
      <input
        aria-label="Prospect name"
        placeholder="Prospect name"
        maxLength={120}
        value={prospect}
        onChange={(e) => {
          setProspect(e.target.value);
          setOpId(null);
        }}
        className={`${INPUT} w-44`}
      />
      <button
        type="submit"
        disabled={busy || !title.trim() || !prospect.trim()}
        aria-busy={busy}
        className={`${PRIMARY} ${busy ? "animate-pulse" : ""}`}
      >
        {busy ? "Creating…" : "New PoV"}
      </button>
    </form>
  );
}
