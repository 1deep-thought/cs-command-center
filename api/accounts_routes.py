"""Account book and Account 360 for Delphina staff (the Renewals tab). Read-only."""

from __future__ import annotations

import logging
from typing import Annotated, Any, Protocol

from fastapi import APIRouter, Depends, HTTPException, Path, Request

from api._lib import accounts_bq
from api._lib.auth import require_delphina

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/py/accounts", tags=["accounts"], dependencies=[Depends(require_delphina)])


class AccountsSource(Protocol):
    def book(self) -> dict[str, Any]: ...
    def account(self, account_id: str) -> dict[str, Any] | None: ...


class _BigQuerySource:
    def __init__(self, oidc_token: str | None) -> None:
        self._token = oidc_token

    def book(self) -> dict[str, Any]:
        return accounts_bq.fetch_book(accounts_bq.get_client(self._token))

    def account(self, account_id: str) -> dict[str, Any] | None:
        return accounts_bq.fetch_account(accounts_bq.get_client(self._token), account_id)


def get_source(request: Request) -> AccountsSource:
    """Overridden in tests. Fails closed with 503 when no read-only credentials are configured."""
    if not accounts_bq.configured():
        raise HTTPException(status_code=503, detail="accounts_store_not_configured")
    return _BigQuerySource(request.headers.get(accounts_bq.OIDC_HEADER))


Source = Annotated[AccountsSource, Depends(get_source)]
AccountId = Annotated[str, Path(pattern=r"^acct_[A-Za-z0-9_-]{1,64}$")]


@router.get("")
def book(source: Source) -> dict[str, Any]:
    """{accounts: [...one row per account, each with its open signals], freshness: [...]}.
    The shape is mirrored in src/types/accounts.ts."""
    try:
        return source.book()
    except Exception as exc:  # a clean 502 for the page; details stay in the logs
        log.exception("account book query failed")
        raise HTTPException(status_code=502, detail="warehouse_query_failed") from exc


@router.get("/{account_id}")
def account(account_id: AccountId, source: Source) -> dict[str, Any]:
    try:
        detail = source.account(account_id)
    except Exception as exc:
        log.exception("account 360 query failed")
        raise HTTPException(status_code=502, detail="warehouse_query_failed") from exc
    if detail is None:
        raise HTTPException(status_code=404, detail="account_not_found")
    return detail
