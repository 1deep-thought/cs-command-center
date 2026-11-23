import "server-only";
import type { AccountBook } from "@/types/accounts";
import { apiBase } from "./api";
import { AuthRequiredError, NotAuthorizedError, getIdToken } from "./auth";

/** Thrown when the API has no read-only credentials for the account data yet. */
export class AccountsNotConfiguredError extends Error {
  constructor() {
    super("accounts_store_not_configured");
  }
}

/** The account book (every account with its open signals) and source freshness. */
export async function getAccountBook(): Promise<AccountBook> {
  const token = await getIdToken();
  const res = await fetch(`${apiBase()}/api/py/accounts`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthRequiredError(true);
  if (res.status === 403) throw new NotAuthorizedError();
  if (res.status === 503) throw new AccountsNotConfiguredError();
  if (!res.ok) throw new Error(`Accounts API ${res.status}`);
  return res.json() as Promise<AccountBook>;
}
