/**
 * Local development safety.
 *
 * Two invariants, both security-relevant:
 *
 *  1. The local-dev switches (ALPHA_LOCAL_DEV, SEED_DEV_PASSWORD) cannot do
 *     anything in production. They fail closed on NODE_ENV, on the flag, and
 *     on the database being local, independently.
 *  2. There is NO dev auth bypass to gate in the first place. Local sign-in
 *     uses the ordinary password provider, so the auth layer must not be able
 *     to see the local-dev flag at all. This test fails if anyone ever wires
 *     one in.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertLocalDatabaseUrl,
  isLocalDatabaseUrl,
  localSeedPassword,
  LOCAL_DEV_FLAG,
  LOCAL_SEED_PASSWORD_MIN,
} from "@/lib/local-db";
import { PASSWORD_MIN } from "@/server/auth-password";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const LOCAL_URL = "postgresql://josephmbedzi@localhost:5432/alphaworkspace_dev";
const PROD_URL = "postgresql://postgres:pw@db.abcdefgh.supabase.co:6543/postgres";

/** Everything switched on, so each test can knock out exactly one condition. */
const permissive = {
  NODE_ENV: "development",
  [LOCAL_DEV_FLAG]: "1",
  DATABASE_URL: LOCAL_URL,
  SEED_DEV_PASSWORD: "local-dev-password",
};

describe("isLocalDatabaseUrl", () => {
  it("accepts Postgres URLs on this machine", () => {
    expect(isLocalDatabaseUrl(LOCAL_URL)).toBe(true);
    expect(isLocalDatabaseUrl("postgres://localhost/alphaworkspace_dev")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://u:p@127.0.0.1:5432/db")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://u:p@[::1]:5432/db")).toBe(true);
  });

  it("rejects everything else, including anything unparseable", () => {
    expect(isLocalDatabaseUrl(PROD_URL)).toBe(false);
    expect(isLocalDatabaseUrl("postgresql://u:p@10.0.0.5:5432/db")).toBe(false);
    // A hostname that merely contains "localhost" is not localhost.
    expect(isLocalDatabaseUrl("postgresql://u:p@localhost.evil.co.za/db")).toBe(false);
    expect(isLocalDatabaseUrl("https://localhost:5432/db")).toBe(false);
    expect(isLocalDatabaseUrl("not a url")).toBe(false);
    expect(isLocalDatabaseUrl("")).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
    expect(isLocalDatabaseUrl(null)).toBe(false);
  });
});

describe("assertLocalDatabaseUrl", () => {
  it("throws when the local-dev flag is set but the database is remote", () => {
    expect(() =>
      assertLocalDatabaseUrl({ ...permissive, DATABASE_URL: PROD_URL }),
    ).toThrow(/not a local Postgres URL/);
  });

  it("throws when the local-dev flag reaches a production build", () => {
    expect(() =>
      assertLocalDatabaseUrl({ ...permissive, NODE_ENV: "production" }),
    ).toThrow(/production build/);
  });

  it("never leaks the connection string in the message", () => {
    try {
      assertLocalDatabaseUrl({ ...permissive, DATABASE_URL: PROD_URL });
      throw new Error("expected a throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain("supabase.co");
      expect(message).not.toContain("pw");
    }
  });

  it("is a no-op in production, where the flag is never set", () => {
    expect(() =>
      assertLocalDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: PROD_URL }),
    ).not.toThrow();
  });
});

describe("localSeedPassword refuses unless every condition holds", () => {
  it("allows only the fully local, fully opted-in case", () => {
    expect(localSeedPassword(permissive)).toEqual({
      allowed: true,
      password: "local-dev-password",
    });
  });

  it("refuses in production even with every other condition satisfied", () => {
    expect(localSeedPassword({ ...permissive, NODE_ENV: "production" })).toEqual({
      allowed: false,
      reason: "production-node-env",
    });
  });

  it("refuses without the explicit flag", () => {
    const noFlag = { ...permissive, [LOCAL_DEV_FLAG]: undefined };
    expect(localSeedPassword(noFlag)).toEqual({
      allowed: false,
      reason: "flag-not-set",
    });
    expect(localSeedPassword({ ...permissive, [LOCAL_DEV_FLAG]: "true" })).toEqual({
      allowed: false,
      reason: "flag-not-set",
    });
  });

  it("refuses against a remote database", () => {
    expect(localSeedPassword({ ...permissive, DATABASE_URL: PROD_URL })).toEqual({
      allowed: false,
      reason: "remote-database",
    });
  });

  it("refuses without a password, so there is no default to guess", () => {
    expect(localSeedPassword({ ...permissive, SEED_DEV_PASSWORD: "" })).toEqual({
      allowed: false,
      reason: "no-password",
    });
  });

  it("refuses a password the real policy would reject", () => {
    expect(localSeedPassword({ ...permissive, SEED_DEV_PASSWORD: "short" })).toEqual({
      allowed: false,
      reason: "too-short",
    });
  });

  it("refuses on an empty environment", () => {
    expect(localSeedPassword({}).allowed).toBe(false);
  });

  it("keeps its minimum in step with the real password policy", () => {
    expect(LOCAL_SEED_PASSWORD_MIN).toBe(PASSWORD_MIN);
  });
});

describe("there is no dev auth bypass", () => {
  it("keeps the local-dev flag out of the auth layer entirely", () => {
    // If auth could read this flag, an env var would decide who is signed in.
    // It must not, at any strength of gating: local sign-in works because the
    // seed writes a real bcrypt hash, not because auth behaves differently.
    for (const file of [
      "src/server/auth.ts",
      "src/server/auth-password.ts",
      "src/proxy.ts",
      "src/app/(auth)/sign-in/actions.ts",
    ]) {
      expect(read(file)).not.toContain(LOCAL_DEV_FLAG);
      expect(read(file)).not.toContain("SEED_DEV_PASSWORD");
    }
  });

  it("exposes exactly one credentials provider, the real password one", () => {
    const auth = read("src/server/auth.ts");
    // \b so this counts Credentials(...) calls, not checkCredentials(...).
    expect(auth.match(/\bCredentials\(/g)).toHaveLength(1);
    expect(auth).toContain('id: "password"');
    // Its authorize() must delegate to the checked bcrypt path, nothing else.
    expect(auth).toContain("checkCredentials(db, email, password)");
  });

  it("never lets a seeded password reach production config", () => {
    // .env.example is the template for real deployments. If SEED_DEV_PASSWORD
    // appeared there it would be one copy-paste from a live known password.
    expect(read(".env.example")).not.toContain("SEED_DEV_PASSWORD");
    expect(read(".env.example")).not.toContain(LOCAL_DEV_FLAG);
  });
});
