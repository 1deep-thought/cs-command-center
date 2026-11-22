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


def _verify_google_token(token: str, client_id: str) -> Mapping[str, object]:
    # Imported lazily so importing the app never needs the Google auth stack.
    from google.auth.transport import requests as g_requests
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(token, g_requests.Request(), audience=client_id)


def _lookup_vendor_user(email: str) -> VendorUserRow | None:
    from google.cloud import bigquery

    from .pov_bigquery import QUERY_TIMEOUT_S, get_pov_client, pov_table

    job = get_pov_client().query(
        f"SELECT email, is_delphina, is_admin FROM `{pov_table('vendor_user')}` "
        "WHERE LOWER(email) = @email LIMIT 1",
        job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("email", "STRING", email)]
        ),
    )
    rows = list(job.result(timeout=QUERY_TIMEOUT_S))
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
