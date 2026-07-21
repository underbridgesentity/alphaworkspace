/**
 * RLS coverage is a standing invariant, not a comment.
 *
 * Supabase publishes `public` through PostgREST to the `anon` /
 * `authenticated` roles, and a newly created table arrives with RLS OFF *and*
 * (before migration 0010) full anon grants from Supabase's default
 * privileges. That combination is exactly what produced the CRITICAL advisory
 * this suite now guards against: 27 tables readable and writable by anyone
 * holding the project's anon key.
 *
 * The test DB is built from the real checked-in migrations, so a new table
 * added without enabling RLS fails here instead of in a Supabase email.
 *
 * NOTE what this does NOT prove: the app connects as `postgres`, which both
 * owns the tables and has BYPASSRLS, so RLS never constrains an application
 * query. Tenant isolation lives in the DAL and is tested in
 * tests/dal-isolation.test.ts. RLS is the second wall, guarding only the Data
 * API; it will never catch a missing workspace filter.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import { createTestDb } from "./helpers/db";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

/** PGlite/postgres-js disagree on the result envelope; accept either. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

describe("RLS coverage in the public schema", () => {
  it("every table has row level security enabled", async () => {
    const result = await db.execute(sql`
      select c.relname as table_name, c.relrowsecurity as rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname
    `);
    const rows = rowsOf(result);

    // Sanity: the query really did see our schema, not an empty set.
    expect(rows.length).toBeGreaterThan(20);

    const unprotected = rows
      .filter((r) => r.rls !== true)
      .map((r) => String(r.table_name));
    // A new table with RLS off lands here as a named failure.
    expect(unprotected).toEqual([]);
  });

  it("no permissive policy quietly re-opens a table", async () => {
    // Deny-all is the design: RLS on, zero policies. A policy added without
    // thought would grant the API roles access again.
    const result = await db.execute(sql`
      select polname from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
    `);
    expect(rowsOf(result).map((r) => String(r.polname))).toEqual([]);
  });
});
