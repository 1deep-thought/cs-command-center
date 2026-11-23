import "server-only";
import { cookies } from "next/headers";

// Holds the Google ID token. HttpOnly, so page scripts can't read it; the Python
// API verifies it on every request (signature, audience, expiry, vendor_user).
export const ID_TOKEN_COOKIE = "cs_id_token";

/** No usable sign-in: no cookie, or the API rejected the token (e.g. expired). */
export class AuthRequiredError extends Error {
  /** True when a token was sent and rejected (expired), false when there was none. */
  readonly expired: boolean;
  constructor(expired = false) {
    super("Sign-in required");
    this.expired = expired;
    this.name = "AuthRequiredError";
  }
}

/** Signed in with Google, but the account is not enabled as Delphina staff. */
export class NotAuthorizedError extends Error {
  constructor() {
    super("Not authorized");
    this.name = "NotAuthorizedError";
  }
}

export async function getIdToken(): Promise<string> {
  const token = (await cookies()).get(ID_TOKEN_COOKIE)?.value;
  if (!token) throw new AuthRequiredError();
  return token;
}
