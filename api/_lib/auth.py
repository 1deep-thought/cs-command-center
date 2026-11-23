"""FastAPI wiring for Delphina-staff auth. Decisions live in auth_core.py.

Use `require_delphina` as a dependency on every router. A test fails if any route
is neither guarded nor on the explicit public allowlist (default-deny).
"""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping

from fastapi import HTTPException, Request

from .auth_core import (
    VENDOR_CACHE_TTL_S,
    AuthError,
    Principal,
    TtlCache,
    VendorUserRow,
    authenticate,
)

log = logging.getLogger(__name__)

_vendor_cache: TtlCache[VendorUserRow] = TtlCache(VENDOR_CACHE_TTL_S)


_CERTS_TTL_S = 600.0
_CERTS_TIMEOUT_S = 3.0
_certs_cache: dict[str, tuple[float, object]] = {}


def _google_request():
    """A google-auth transport that times out in 3s and reuses Google's signing certs for
    10 minutes, so one slow or repeated cert fetch cannot eat the 10s serverless budget."""
    import time

    from google.auth.transport import requests as g_requests

    class _Transport(g_requests.Request):
        def __call__(self, url, method="GET", body=None, headers=None, timeout=_CERTS_TIMEOUT_S, **kwargs):
            now = time.monotonic()
            hit = _certs_cache.get(url)
            if method == "GET" and hit and now < hit[0]:
                return hit[1]
            response = super().__call__(url, method=method, body=body, headers=headers, timeout=timeout, **kwargs)
            if method == "GET" and getattr(response, "status", None) == 200:
                _certs_cache[url] = (now + _CERTS_TTL_S, response)
            return response

    return _Transport()


def _verify_google_token(token: str, client_id: str) -> Mapping[str, object]:
    # Imported lazily so importing the app never needs the Google auth stack.
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(token, _google_request(), audience=client_id)


def _lookup_vendor_user(email: str) -> VendorUserRow | None:
    from google.cloud import bigquery

    from .pov_bigquery import get_pov_client, pov_table

    job = get_pov_client().query(
        f"SELECT email, is_delphina, is_admin FROM `{pov_table('vendor_user')}` "
        "WHERE LOWER(email) = @email LIMIT 1",
        job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("email", "STRING", email)]
        ),
    )
    rows = list(job.result(timeout=3.0))  # leave room in the 10s budget for the real request
    if not rows:
        return None
    r = rows[0]
    return VendorUserRow(email=r["email"], is_delphina=r["is_delphina"], is_admin=r["is_admin"])


def require_delphina(request: Request) -> Principal:
    """Dependency: signed-in Delphina staff only."""
    try:
        return authenticate(
            request.headers.get("authorization"),
            os.environ,
            verify_token=_verify_google_token,
            lookup_vendor_user=_lookup_vendor_user,
            cache=_vendor_cache,
        )
    except AuthError as exc:
        if exc.status >= 500:
            log.error("auth failure: %s", exc.code)
        headers = {"WWW-Authenticate": "Bearer"} if exc.status == 401 else None
        raise HTTPException(status_code=exc.status, detail=exc.code, headers=headers) from None
