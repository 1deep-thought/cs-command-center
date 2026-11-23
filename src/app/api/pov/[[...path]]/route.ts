import { apiBase } from "@/lib/api";
import { ID_TOKEN_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";

// Browser -> PoV API bridge. The sign-in token lives in an HttpOnly cookie the page cannot
// read, so client components call /api/pov/... and this route adds the token. It forwards
// only to /api/py/pov, and the Python API still verifies the token and every rule.

type Context = { params: Promise<{ path?: string[] }> };

const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_SEGMENTS = 6;
const MAX_BODY_CHARS = 20_000;

function json(status: number, detail: string): Response {
  return Response.json({ detail }, { status });
}

async function forward(request: Request, context: Context): Promise<Response> {
  const method = request.method;
  if (method !== "GET") {
    // Writes must come from our own pages.
    const origin = request.headers.get("origin");
    if (origin === null || origin !== new URL(request.url).origin) return json(403, "bad_origin");
  }
  const { path = [] } = await context.params;
  if (path.length > MAX_SEGMENTS || !path.every((segment) => SEGMENT.test(segment))) return json(404, "not_found");

  const token = (await cookies()).get(ID_TOKEN_COOKIE)?.value;
  if (!token) return json(401, "sign_in_required");

  let body: string | undefined;
  if (method === "POST" || method === "PATCH") {
    body = await request.text();
    if (body.length > MAX_BODY_CHARS) return json(413, "body_too_large");
  }
  const target = `${apiBase()}/api/py/pov${path.length ? `/${path.join("/")}` : ""}${new URL(request.url).search}`;
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body,
    });
  } catch {
    return json(502, "api_unreachable");
  }
  if (upstream.status === 204) return new Response(null, { status: 204 });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request, context: Context) {
  return forward(request, context);
}
export async function POST(request: Request, context: Context) {
  return forward(request, context);
}
export async function PATCH(request: Request, context: Context) {
  return forward(request, context);
}
export async function DELETE(request: Request, context: Context) {
  return forward(request, context);
}
