/**
 * Guards for the LOCAL development database.
 *
 * On this machine `.env.local` points at PRODUCTION Supabase, so anything that
 * wants a throwaway database has to prove it is talking to one. This module is
 * the single place that answers "is this a local database", and every helper
 * here FAILS CLOSED: an unset, unparseable, or non-local value is treated as
 * production and the dangerous thing is refused.
 *
 * Nothing here imports "server-only", because the seed script and the local
 * runner (plain tsx, no Next bundler) both depend on it.
 */

type EnvLike = Record<string, string | undefined>;

/**
 * Set to "1" by scripts/with-local-env.ts. It is never set in .env.example, in
 * Vercel, or in any checked-in file, so production cannot inherit it by
 * accident: something on the machine has to opt in deliberately.
 */
export const LOCAL_DEV_FLAG = "ALPHA_LOCAL_DEV";

/**
 * Mirrors PASSWORD_MIN in src/server/auth-password.ts. The two are asserted
 * equal in tests/local-dev.test.ts, so they cannot drift.
 */
export const LOCAL_SEED_PASSWORD_MIN = 10;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * True only for a Postgres URL on this machine. Anything else, including a
 * value we cannot parse, is false.
 */
export function isLocalDatabaseUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return false;
  }
  return LOCAL_HOSTS.has(url.hostname.toLowerCase());
}

/**
 * Backstop for the running app. If something claims to be the local dev
 * environment, the database it actually connected to had better be local.
 * Throws rather than serving production data to a session that believes it is
 * disposable. The URL is never included in the message, it carries credentials.
 */
export function assertLocalDatabaseUrl(env: EnvLike = process.env): void {
  if (env[LOCAL_DEV_FLAG] !== "1") return;
  if (env.NODE_ENV === "production") {
    throw new Error(
      `${LOCAL_DEV_FLAG} is set in a production build. Refusing to start: ` +
        "this flag exists only for local development.",
    );
  }
  if (!isLocalDatabaseUrl(env.DATABASE_URL)) {
    throw new Error(
      `${LOCAL_DEV_FLAG}=1 but DATABASE_URL is not a local Postgres URL. ` +
        "Refusing to connect, this is the guard that keeps npm run dev:local " +
        "off production. Check .env.dev-local.",
    );
  }
}

export type SeedPasswordDecision =
  | { allowed: true; password: string }
  | {
      allowed: false;
      reason:
        | "production-node-env"
        | "flag-not-set"
        | "remote-database"
        | "no-password"
        | "too-short";
    };

/**
 * Decides whether the seed may give demo users a known password.
 *
 * All four conditions must hold, and they are checked strongest first so the
 * refusal reason is honest. There is no default password: with
 * SEED_DEV_PASSWORD unset the seed writes no password hash at all and the
 * seeded accounts stay magic-link only, exactly as they are in production.
 */
export function localSeedPassword(env: EnvLike = process.env): SeedPasswordDecision {
  if (env.NODE_ENV === "production") {
    return { allowed: false, reason: "production-node-env" };
  }
  if (env[LOCAL_DEV_FLAG] !== "1") {
    return { allowed: false, reason: "flag-not-set" };
  }
  if (!isLocalDatabaseUrl(env.DATABASE_URL)) {
    return { allowed: false, reason: "remote-database" };
  }
  const password = env.SEED_DEV_PASSWORD ?? "";
  if (!password) return { allowed: false, reason: "no-password" };
  if (password.length < LOCAL_SEED_PASSWORD_MIN) {
    return { allowed: false, reason: "too-short" };
  }
  return { allowed: true, password };
}
