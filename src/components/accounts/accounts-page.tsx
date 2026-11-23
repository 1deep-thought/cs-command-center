import { NoAccessCard, SignInCard } from "@/components/auth/sign-in";
import { AccountsNotConfiguredError, getAccountBook } from "@/lib/accounts-api";
import { AuthRequiredError, NotAuthorizedError } from "@/lib/auth";
import { getPovList } from "@/lib/pov-api";
import type { AccountBook } from "@/types/accounts";
import type { PovListItem } from "@/types/pov";
import { AccountsApp } from "./accounts-app";

const SHELL = "mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 py-5";
const CARD = "max-w-xl rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";

// Async server component: uncached API fetches, so it must render inside <Suspense>.
export async function AccountsPage() {
  let book: AccountBook;
  let povs: PovListItem[];
  try {
    // PoVs are optional decoration (which accounts came from a PoV): never fail the page for them.
    [book, povs] = await Promise.all([getAccountBook(), getPovList().catch(() => [])]);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return (
        <main className={SHELL}>
          <SignInCard expired={error.expired} />
        </main>
      );
    }
    if (error instanceof NotAuthorizedError) {
      return (
        <main className={SHELL}>
          <NoAccessCard />
        </main>
      );
    }
    if (error instanceof AccountsNotConfiguredError) {
      return (
        <main className={SHELL}>
          <div role="alert" className={CARD}>
            <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Account data isn&apos;t connected yet</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              This deployment has no read-only access to the cs_analytics data. An admin needs to set GCP_WIF_AUDIENCE and
              GCP_SERVICE_ACCOUNT_EMAIL for this Vercel project and allow it in the Google identity pool.
            </p>
          </div>
        </main>
      );
    }
    throw error;
  }
  return (
    <main>
      <AccountsApp book={book} povs={povs} />
    </main>
  );
}
