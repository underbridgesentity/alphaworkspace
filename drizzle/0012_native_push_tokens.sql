-- Device tokens for the store shell's native push (FCM on Android, APNs
-- through FCM on iOS).
--
-- WHY A NEW TABLE AND NOT A COLUMN ON push_subscriptions
-- A web push subscription is an endpoint URL plus a p256dh key plus an auth
-- secret, all three NOT NULL and all three required by VAPID. A native token
-- is a single opaque device string that Google's servers resolve. Storing the
-- second shape in the first table would have meant dropping the two NOT NULLs
-- that keep every existing web row honest, in exchange for columns the new
-- rows never fill. The two are different credentials for different transports
-- and they get different tables. The user's per-type "push" preference still
-- covers both: the fan-out happens in the channel adapter, not in the schema.
--
-- `token` is UNIQUE because the device token rotates and a device re-registers
-- on every launch; without it a phone would accumulate one row per launch and
-- the user would get one notification per row.

CREATE TABLE IF NOT EXISTS "native_push_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "token" text NOT NULL,
  "platform" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "native_push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "native_push_tokens"
    ADD CONSTRAINT "native_push_tokens_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "native_push_user_idx"
  ON "native_push_tokens" ("user_id");
--> statement-breakpoint
-- A newly created table arrives with RLS OFF, and `public` is published
-- through PostgREST to the anon/authenticated roles. Migration 0009 explains
-- the whole story; tests/rls.test.ts fails by name if this is ever forgotten.
-- Deny-all by design: RLS on, zero policies. The app connects as `postgres`
-- (BYPASSRLS), so this constrains only the Data API, never a query.
ALTER TABLE "native_push_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Guarded on the roles existing, because the test suite replays these same
-- migrations against PGlite where anon/authenticated are not present.
DO $$
DECLARE
  api_roles text;
BEGIN
  SELECT string_agg(quote_ident(rolname), ', ')
    INTO api_roles
    FROM pg_roles
   WHERE rolname IN ('anon', 'authenticated');

  IF api_roles IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL ON public.native_push_tokens FROM %s', api_roles
    );
  END IF;
END $$;
