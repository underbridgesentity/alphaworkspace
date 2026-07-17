import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, LimitError, ValidationError } from "@/server/dal/errors";

/**
 * Route-handler plumbing: one place that turns DAL/zod errors into friendly
 * JSON. Error states apologise and offer a way forward, never stack traces.
 */

type Params = Record<string, string>;
type Handler = (req: NextRequest, params: Params) => Promise<Response>;

/**
 * CSRF backstop for session-cookie-authenticated mutations: browsers attach
 * an Origin header to every cross-site POST/PUT/PATCH/DELETE; if one is
 * present and doesn't match our host, refuse. Server-to-server callers
 * (PayFast ITN, cron) either don't go through api() or send no Origin, so
 * they are unaffected. Cookie SameSite=Lax is the first line; this is the
 * second.
 */
function assertSameOrigin(req: NextRequest): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  if (!host || originHost !== host) {
    throw new AppError("forbidden", "Cross-origin request refused", 403);
  }
}

export function api(handler: Handler) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<Params> },
  ): Promise<Response> => {
    try {
      assertSameOrigin(req);
      return await handler(req, await ctx.params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err instanceof LimitError
            ? { limit: err.limit, ...(err.feature ? { feature: err.feature } : {}) }
            : {}),
        },
      },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json(
      {
        error: {
          code: "invalid",
          message: first
            ? `${first.path.join(".") || "input"}: ${first.message}`
            : "That input doesn't look right",
        },
      },
      { status: 400 },
    );
  }
  console.error("[api] unhandled", err);
  return NextResponse.json(
    {
      error: {
        code: "internal",
        message: "Something broke on our side. It's been noted, try again.",
      },
    },
    { status: 500 },
  );
}

export async function readJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  // Requiring the JSON content type means browsers preflight any cross-site
  // attempt (HTML forms can't produce it), killing form-based CSRF outright.
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ValidationError("Expected an application/json body");
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError("Expected a JSON body");
  }
  return schema.parse(raw);
}

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}
