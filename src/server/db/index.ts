import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { assertLocalDatabaseUrl } from "@/lib/local-db";

export type Db = PostgresJsDatabase<typeof schema>;

// If this process claims to be the local dev environment (ALPHA_LOCAL_DEV=1,
// set only by scripts/with-local-env.ts), the database it reaches had better
// be local. Throwing here is the last line of defence against a dev session
// silently editing production. It is a no-op in every other environment.
assertLocalDatabaseUrl(process.env);

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
