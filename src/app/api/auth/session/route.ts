import { NextResponse } from "next/server";
import { ID_TOKEN_COOKIE } from "@/lib/auth";

// Stores the Google ID token in an HttpOnly cookie (POST) or clears it (DELETE).
// This route does not trust the token: the Python API verifies it on every request.

const MAX_TOKEN_CHARS = 4096;

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

function claimsOf(token: string): { aud?: unknown; exp?: unknown } | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { credential?: unknown } | null;
  const token = body?.credential;
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_CHARS) {
    return NextResponse.json({ error: "bad_credential" }, { status: 400 });
  }
  const claims = claimsOf(token);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!claims || typeof claims.exp !== "number" || claims.aud !== clientId) {
    return NextResponse.json({ error: "bad_credential" }, { status: 400 });
  }
  const maxAge = Math.min(3600, Math.floor(claims.exp - Date.now() / 1000));
  if (maxAge < 60) return NextResponse.json({ error: "expired" }, { status: 400 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ID_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ID_TOKEN_COOKIE);
  return res;
}
