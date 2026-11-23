"""Pure auth decisions for Delphina staff (no FastAPI, no BigQuery imports).

Kept dependency-free so the whole flow unit-tests without network or secrets:
`authenticate` takes the token verifier and the vendor_user lookup as arguments.

Model (docs: "Proof of Value Workspace: Design"):
- Delphina staff sign in with Google. The API receives the Google ID token as
  `Authorization: Bearer <token>`.
- Being allowed in means a `vendor_user` row with is_delphina = TRUE. Anyone else
  with a valid Google token gets 403, never a partial view.
- Every failure path denies. A lookup error is a 503, never an allow.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Mapping
from typing import Final, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict

GOOGLE_ISSUERS: Final = frozenset({"accounts.google.com", "https://accounts.google.com"})
VENDOR_CACHE_TTL_S: Final = 60.0  # a removed user stays in for at most this long

log = logging.getLogger(__name__)

T = TypeVar("T")


class AuthError(Exception):
    """Carries the HTTP status and a stable machine-readable code (never a secret)."""

    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code


class Principal(BaseModel):
    model_config = ConfigDict(frozen=True)

    email: str
    is_admin: bool
    kind: Literal["delphina"] = "delphina"


class VendorUserRow(BaseModel):
    email: str
    is_delphina: bool | None = None
    is_admin: bool | None = None


class TtlCache(Generic[T]):
    """Tiny in-process cache. Serverless instances are short-lived, so this only
    saves repeat BigQuery calls within one warm instance."""

    def __init__(self, ttl_s: float, clock: Callable[[], float] = time.monotonic) -> None:
        self._ttl = ttl_s
        self._clock = clock
        self._items: dict[str, tuple[float, T]] = {}

    def get(self, key: str) -> T | None:
        hit = self._items.get(key)
        if hit is None:
            return None
        expires_at, value = hit
        if self._clock() >= expires_at:
            del self._items[key]
            return None
        return value

    def put(self, key: str, value: T) -> None:
        self._items[key] = (self._clock() + self._ttl, value)


def bearer_token(header: str | None) -> str:
    if not header:
        raise AuthError(401, "missing_token")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise AuthError(401, "malformed_authorization")
    return token


def email_from_claims(claims: Mapping[str, object], *, client_id: str) -> str:
    """Re-check the claims the Google library already verified (defense in depth)."""
    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise AuthError(401, "bad_issuer")
    if claims.get("aud") != client_id:
        raise AuthError(401, "bad_audience")
    if claims.get("email_verified") is not True:
        raise AuthError(401, "email_unverified")
    email = claims.get("email")
    if not isinstance(email, str) or not email.strip():
        raise AuthError(401, "no_email")
    return email.strip().lower()


def principal_for(email: str, row: VendorUserRow | None) -> Principal:
    if row is None or row.is_delphina is not True:
        raise AuthError(403, "not_delphina")
    return Principal(email=email, is_admin=row.is_admin is True)


def dev_bypass_email(env: Mapping[str, str]) -> str | None:
    """Local development only. Any Vercel environment (VERCEL / VERCEL_ENV is set on
    every deployment, previews included) disables the bypass."""
    if env.get("VERCEL") or env.get("VERCEL_ENV"):
        return None
    email = env.get("AUTH_DEV_EMAIL", "").strip().lower()
    return email or None


def authenticate(
    authorization: str | None,
    env: Mapping[str, str],
    *,
    verify_token: Callable[[str, str], Mapping[str, object]],
    lookup_vendor_user: Callable[[str], VendorUserRow | None],
    cache: TtlCache[VendorUserRow] | None = None,
) -> Principal:
    bypass = dev_bypass_email(env)
    if bypass:
        return Principal(email=bypass, is_admin=True)

    client_id = env.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    if not client_id:
        raise AuthError(503, "auth_not_configured")

    token = bearer_token(authorization)
    try:
        claims = verify_token(token, client_id)
    except Exception as exc:  # bad signature, expired, wrong audience: all the same to the caller
        log.info("token rejected: %s", type(exc).__name__)
        raise AuthError(401, "invalid_token") from None
    email = email_from_claims(claims, client_id=client_id)

    row = cache.get(email) if cache else None
    if row is None:
        try:
            row = lookup_vendor_user(email)
        except Exception:
            log.exception("vendor_user lookup failed")  # cause stays in logs, never in the response
            raise AuthError(503, "auth_lookup_failed") from None
        if row is not None and row.is_delphina is True and cache:
            cache.put(email, row)  # only positive results are cached
    return principal_for(email, row)
