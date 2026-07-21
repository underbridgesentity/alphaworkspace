-- Close the Supabase "rls_disabled_in_public" / "sensitive_columns_exposed"
-- advisories.
--
-- WHY THIS IS NEEDED
-- Supabase publishes every table in `public` through PostgREST (the Data API)
-- to the `anon` and `authenticated` roles. Row-Level Security is the ONLY
-- thing standing in front of that API, and our tables were created by Drizzle
-- with RLS off, so anyone holding the project's anon key (which Supabase
-- treats as public by design) could read and write all 27 tables, including
-- users, accounts, sessions, verification_tokens, push_subscriptions and
-- subscriptions.
--
-- WHY THIS IS SAFE FOR THE APP
-- This app never uses the Data API. It talks to Postgres directly as the
-- `postgres` role (through Supavisor), and `postgres` has BYPASSRLS = true, as
-- does `service_role` (used for Storage). `anon` / `authenticated` do NOT.
-- So enabling RLS blocks the exposed API path and leaves every application
-- query untouched.
--
-- DENY-ALL BY DESIGN
-- RLS is enabled with NO policies, so anon/authenticated can read nothing at
-- all. Tenant isolation deliberately stays where it is enforced and tested:
-- the DAL (`withWorkspace()` + tests/dal-isolation.test.ts). This is a second
-- wall, not a replacement for the first.
--
-- The REVOKE is defence in depth: even if a permissive policy is ever added by
-- mistake, the API roles still hold no table privileges.
--
-- NOTE FOR FUTURE MIGRATIONS: a newly created table has RLS OFF. Any migration
-- that adds a table must enable it too, or this advisory comes straight back.

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.relname);
  END LOOP;
END $$;
