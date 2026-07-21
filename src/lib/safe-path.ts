/**
 * A same-app relative path, or null. The one guard for every post-auth
 * redirect target (`next`, the Auth.js callback-url cookie, invite returns).
 *
 * String-sniffing "starts with / but not //" is NOT enough: browsers treat a
 * backslash as a slash in the authority, so `/\evil.com` and `/%5Cevil.com`
 * resolve OFF-SITE. Resolve against a throwaway origin and require it to stay
 * on that origin instead.
 */
export function safeRelativePath(
  p: string | undefined | null,
): string | null {
  if (!p || typeof p !== "string") return null;
  if (!p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\")) {
    return null;
  }
  try {
    const u = new URL(p, "http://x.invalid");
    if (u.origin !== "http://x.invalid") return null; // escaped the origin
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}
