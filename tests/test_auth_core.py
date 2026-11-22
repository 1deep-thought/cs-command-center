"""Auth decisions, with fakes for the Google verifier and the vendor_user lookup."""

import pytest

from api._lib.auth_core import (
    AuthError,
    TtlCache,
    VendorUserRow,
    authenticate,
    bearer_token,
    dev_bypass_email,
    email_from_claims,
)

CLIENT_ID = "client-123.apps.googleusercontent.com"
ENV = {"GOOGLE_OAUTH_CLIENT_ID": CLIENT_ID}


def good_claims(**over):
    return {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "email": "Staff@Delphina.example",
        "email_verified": True,
        **over,
    }


def staff(is_delphina=True, is_admin=False):
    return VendorUserRow(email="staff@delphina.example", is_delphina=is_delphina, is_admin=is_admin)


def run(header="Bearer tok", env=ENV, claims=None, row=None, cache=None, verify_raises=False, lookup_raises=False):
    def verify(token, client_id):
        if verify_raises:
            raise ValueError("bad signature")
        return claims if claims is not None else good_claims()

    def lookup(email):
        if lookup_raises:
            raise RuntimeError("bigquery down")
        return row

    return authenticate(header, env, verify_token=verify, lookup_vendor_user=lookup, cache=cache)


def status_of(**kw) -> tuple[int, str]:
    with pytest.raises(AuthError) as e:
        run(**kw)
    return e.value.status, e.value.code


def test_delphina_user_is_allowed_and_email_normalised():
    p = run(row=staff(is_admin=True))
    assert p.email == "staff@delphina.example"
    assert p.is_admin is True


def test_non_admin_delphina_user_is_allowed():
    assert run(row=staff(is_admin=False)).is_admin is False


@pytest.mark.parametrize("row", [None, staff(is_delphina=False), staff(is_delphina=None)])
def test_valid_google_user_not_marked_delphina_is_403(row):
    assert status_of(row=row) == (403, "not_delphina")


def test_missing_and_malformed_authorization_are_401():
    assert status_of(header=None) == (401, "missing_token")
    assert status_of(header="Basic abc") == (401, "malformed_authorization")
    assert status_of(header="Bearer ") == (401, "malformed_authorization")


def test_bad_token_is_401_without_leaking_why():
    assert status_of(verify_raises=True, row=staff()) == (401, "invalid_token")


@pytest.mark.parametrize(
    "claims,code",
    [
        (good_claims(iss="https://evil.example"), "bad_issuer"),
        (good_claims(aud="other-client"), "bad_audience"),
        (good_claims(email_verified=False), "email_unverified"),
        (good_claims(email_verified="true"), "email_unverified"),
        (good_claims(email=None), "no_email"),
    ],
)
def test_claim_checks(claims, code):
    assert status_of(claims=claims, row=staff()) == (401, code)


def test_lookup_failure_fails_closed():
    assert status_of(lookup_raises=True) == (503, "auth_lookup_failed")


def test_missing_client_id_is_503():
    assert status_of(env={}, row=staff()) == (503, "auth_not_configured")


def test_dev_bypass_works_only_off_vercel():
    env = {"AUTH_DEV_EMAIL": "Me@Delphina.example"}
    assert dev_bypass_email(env) == "me@delphina.example"
    assert dev_bypass_email({**env, "VERCEL": "1"}) is None
    assert dev_bypass_email({**env, "VERCEL_ENV": "preview"}) is None
    assert dev_bypass_email({}) is None


def test_dev_bypass_skips_token_and_lookup():
    p = authenticate(None, {"AUTH_DEV_EMAIL": "me@delphina.example"}, verify_token=None, lookup_vendor_user=None)
    assert p.email == "me@delphina.example" and p.is_admin


def test_bypass_is_ignored_on_vercel_even_when_set():
    env = {"AUTH_DEV_EMAIL": "me@delphina.example", "VERCEL": "1"}
    with pytest.raises(AuthError) as e:
        authenticate(None, env, verify_token=lambda t, c: {}, lookup_vendor_user=lambda e: None)
    assert e.value.code == "auth_not_configured"


def test_only_positive_lookups_are_cached_and_expire():
    now = [0.0]
    cache = TtlCache[VendorUserRow](60.0, clock=lambda: now[0])
    calls = []

    def lookup(email):
        calls.append(email)
        return staff()

    def go():
        return authenticate(
            "Bearer t", ENV, verify_token=lambda t, c: good_claims(), lookup_vendor_user=lookup, cache=cache
        )

    go(); go()
    assert len(calls) == 1
    now[0] = 61.0
    go()
    assert len(calls) == 2


def test_negative_result_is_not_cached():
    cache = TtlCache[VendorUserRow](60.0)
    calls = []

    def lookup(email):
        calls.append(email)
        return None

    for _ in range(2):
        with pytest.raises(AuthError):
            authenticate("Bearer t", ENV, verify_token=lambda t, c: good_claims(), lookup_vendor_user=lookup, cache=cache)
    assert len(calls) == 2


def test_bearer_scheme_is_case_insensitive():
    assert bearer_token("bearer abc") == "abc"


def test_email_from_claims_requires_exact_audience():
    with pytest.raises(AuthError):
        email_from_claims(good_claims(aud=[CLIENT_ID]), client_id=CLIENT_ID)
