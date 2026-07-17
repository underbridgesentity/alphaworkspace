import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection (Next 16 proxy). This is UX-level only, a cheap cookie
 * presence check that bounces signed-out visitors to /sign-in. Real
 * authorisation happens server-side on every request (requireUser +
 * workspace membership in the DAL); nothing trusts this check.
 */
export function proxy(request: NextRequest) {
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
    "/app",
    "/w/:path*",
    "/onboarding",
    "/invite/:path*",
    "/account/:path*",
  ],
};
