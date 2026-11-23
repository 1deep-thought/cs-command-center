import { Suspense } from "react";
import { AccountsPage } from "@/components/accounts/accounts-page";

// Renewals: the account book and Account 360, the same as the cs-analytics app.
// Client routes: #/ (accounts) and #/account/<id>/<tab>.
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AccountsPage />
    </Suspense>
  );
}

function PageLoading() {
  return (
    <main className="px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400" aria-busy="true">
      Loading accounts…
    </main>
  );
}
