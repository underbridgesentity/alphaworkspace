import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

// prepare:false keeps us compatible with Supabase's transaction pooler.
const client =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/alpha", {
    prepare: false,
    max: 8,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db: Db = drizzle(client, { schema });
export { schema };
