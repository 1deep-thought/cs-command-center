"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type GoogleId = {
  initialize(config: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
  disableAutoSelect(): void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
const CARD =
  "max-w-sm rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";
const BTN =
  "h-7 rounded-md border border-zinc-200 px-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900";

export function SignInCard() {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  function init() {
    const id = window.google?.accounts.id;
    if (!id || !buttonRef.current || !CLIENT_ID) return;
    id.initialize({
      client_id: CLIENT_ID,
      callback: async ({ credential }) => {
        setError(null);
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential }),
        });
        if (res.ok) router.refresh();
        else setError("Sign-in failed. Try again.");
      },
    });
    id.renderButton(buttonRef.current, { theme: "outline", size: "medium", text: "signin_with" });
  }

  return (
    <div className={CARD}>
      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Sign in</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Use your Delphina Google account to view customer health and renewals.
      </p>
      {CLIENT_ID ? (
        <>
          <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={init} />
          <div ref={buttonRef} className="mt-3 h-8" />
        </>
      ) : (
        <p role="alert" className="mt-3 text-xs text-zinc-700 dark:text-zinc-300">
          NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is not set.
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className={BTN}
      onClick={async () => {
        window.google?.accounts.id.disableAutoSelect();
        await fetch("/api/auth/session", { method: "DELETE" });
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

export function NoAccessCard() {
  return (
    <div className={CARD} role="alert">
      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">No access</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        This Google account isn&apos;t enabled for CS Command Center. Ask a Delphina admin to add you,
        or sign out and use another account.
      </p>
      <div className="mt-3">
        <SignOutButton />
      </div>
    </div>
  );
}
