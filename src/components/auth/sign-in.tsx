"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
const BUTTON =
  "h-7 rounded-md border border-zinc-200 px-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900";
const LINK =
  "text-[11px] leading-4 text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-zinc-400 disabled:opacity-50 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-zinc-200";
const ERROR = "mt-2 text-xs text-rose-600 dark:text-rose-400";

export function SignInCard({
  expired = false,
  message,
  onSignedIn,
}: {
  expired?: boolean;
  /** Replaces the default line under the heading. */
  message?: string;
  /** Called after a successful sign-in INSTEAD of refreshing the page (used to resume paused saves). */
  onSignedIn?: () => void;
}) {
  const router = useRouter();
  // The Google callback is registered once; read the latest handler through a ref.
  const signedInRef = useRef(onSignedIn);
  useEffect(() => {
    signedInRef.current = onSignedIn;
  }, [onSignedIn]);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function init() {
    const id = window.google?.accounts.id;
    if (!id || !buttonRef.current || !CLIENT_ID) return;
    id.initialize({
      client_id: CLIENT_ID,
      callback: async ({ credential }) => {
        setError(null);
        try {
          const res = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential }),
          });
          if (res.ok) {
            if (signedInRef.current) signedInRef.current();
            else router.refresh();
          } else if (res.status === 400) setError("That sign-in expired. Try again.");
          else setError("Sign-in failed. Try again.");
        } catch {
          setError("Couldn't reach the server. Check your connection and try again.");
        }
      },
    });
    id.renderButton(buttonRef.current, { theme: "outline", size: "medium", text: "signin_with" });
    setReady(true);
  }

  return (
    <div className={CARD}>
      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
        {expired ? "Session expired" : "Sign in"}
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {message ??
          (expired
            ? "Sign in again to carry on where you left off."
            : "Use your Delphina Google account to open CS Command Center.")}
      </p>
      {CLIENT_ID ? (
        <>
          <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={init} />
          <div className="relative mt-3 h-8 w-[200px]">
            {ready ? null : (
              <div
                aria-hidden
                className="absolute inset-0 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900"
              />
            )}
            <div ref={buttonRef} />
          </div>
        </>
      ) : (
        <p role="alert" className={ERROR}>
          Sign-in isn&apos;t set up for this deployment. Contact an admin.
        </p>
      )}
      {error ? (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SignOutButton({ variant = "button" }: { variant?: "button" | "link" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={variant === "link" ? LINK : BUTTON}
      onClick={async () => {
        setBusy(true);
        try {
          window.google?.accounts.id.disableAutoSelect();
          const res = await fetch("/api/auth/session", { method: "DELETE" });
          if (res.ok) router.refresh();
        } finally {
          setBusy(false);
        }
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
