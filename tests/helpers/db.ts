/**
 * In-memory Postgres (PGlite) wired through the real Drizzle schema and the
 * real checked-in migrations — tests exercise exactly what production runs.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db";
import { resolveCtx, type Ctx } from "@/server/dal/context";

export async function createTestDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../drizzle"),
  });
  return db as unknown as Db;
}

export async function createTestUser(
  db: Db,
  email: string,
  name?: string,
): Promise<{ id: string; email: string; name: string | null }> {
  const [user] = await db
    .insert(schema.users)
    .values({ email, name: name ?? email.split("@")[0] })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
    });
  return user;
}

export async function addMember(
  db: Db,
  workspaceId: string,
  userId: string,
  role: "owner" | "admin" | "member" = "member",
): Promise<void> {
  await db.insert(schema.memberships).values({ workspaceId, userId, role });
}

export async function ctxFor(
  db: Db,
  userId: string,
  slugOrId: string,
): Promise<Ctx> {
  return resolveCtx(db, userId, slugOrId);
}
