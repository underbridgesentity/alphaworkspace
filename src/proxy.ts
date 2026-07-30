import { NextResponse, type NextRequest } from "next/server";
import { shellPlatform } from "@/lib/shell";

/**
 * Route protection (Next 16 proxy). This is UX-level only, a cheap cookie
 * presence check that bounces signed-out visitors to /sign-in. Real
 * authorisation happens server-side on every request (requireUser +
 * workspace membership in the DAL); nothing trusts this check.
 *
 * It also carries the one commerce gate that lives outside the app surface:
 * the store shell (Capacitor webview, "AlphaShell/…" UA marker) never enters
 * marketing in its normal flow, but a deep link to /pricing must not show a
 * reviewer a page of prices, so it bounces to /app here, server-side, while
 * /pricing stays a static page for the web.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/pricing") {
    if (shellPlatform(request.headers.get("user-agent"))) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    // /pricing is public: no session bounce for ordinary browsers.
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/pricing",
    "/app",
    "/w/:path*",
    "/onboarding",
    "/invite/:path*",
    "/account/:path*",
    "/admin/:path*",
  ],
};
