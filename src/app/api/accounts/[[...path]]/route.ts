import { apiBase } from "@/lib/api";
import { ID_TOKEN_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";

// Browser -> accounts API bridge (read-only). The sign-in token lives in an HttpOnly cookie the
// page cannot read, so the Account 360 calls /api/accounts/<id> and this route adds the token.
// The Python API still verifies the token on every request.

type Context = { params: Promise<{ path?: string[] }> };

const ACCOUNT_ID = /^acct_[A-Za-z0-9_-]{1,64}$/;

function json(status: number, detail: string): Response {
  return Response.json({ detail }, { status });
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { path = [] } = await context.params;
  if (path.length > 1 || (path.length === 1 && !ACCOUNT_ID.test(path[0]))) return json(404, "not_found");

  const token = (await cookies()).get(ID_TOKEN_COOKIE)?.value;
  if (!token) return json(401, "sign_in_required");

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBase()}/api/py/accounts${path.length ? `/${path[0]}` : ""}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return json(502, "api_unreachable");
  }
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" },
  });
}
