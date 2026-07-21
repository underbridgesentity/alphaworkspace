-- Stop the RLS hole from coming back on the NEXT table.
--
-- Migration 0009 enabled RLS and revoked anon/authenticated grants on the 27
-- tables that existed at the time. That was point-in-time. Supabase ships
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES TO anon, authenticated;
-- which is exactly how those 27 tables became world-readable through the Data
-- API in the first place: every CREATE TABLE in `public` silently acquires
-- full anon privileges, and arrives with RLS off. Without this migration the
-- next table we add re-opens the advisory, and the only thing standing in the
-- way is a comment asking people to remember.
--
-- So: revoke the DEFAULT privileges (tables, sequences, functions), then
-- re-sweep everything. Idempotent and safe to re-run.
--
-- Views/materialised/foreign tables cannot carry RLS themselves, so they only
-- get the revoke. A view in `public` owned by postgres runs with the owner's
-- rights and would bypass RLS on its base tables, which is the classic
-- `sensitive_columns_exposed` vector: any view added here must be created
-- WITH (security_invoker = true).
--
-- The `anon` / `authenticated` roles exist only on Supabase. The test suite
-- runs these migrations against PGlite, so every statement that names them is
-- guarded on the role actually existing (0009 shipped without that guard and
-- broke the whole suite).

DO $$
DECLARE
  api_roles text;
  t record;
BEGIN
  SELECT string_agg(quote_ident(rolname), ', ')
    INTO api_roles
    FROM pg_roles
   WHERE rolname IN ('anon', 'authenticated');

  IF api_roles IS NOT NULL THEN
    -- The faucet: new objects must not be granted to the API roles at all.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %s',
      current_user, api_roles);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %s',
      current_user, api_roles);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %s',
      current_user, api_roles);
  END IF;

  -- Re-sweep, now including partitioned tables (RLS) and views / materialised
  -- views / foreign tables (revoke only). 0009 covered ordinary tables only.
  FOR t IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    IF t.relkind IN ('r', 'p') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    END IF;
    IF api_roles IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM %s', t.relname, api_roles);
    END IF;
  END LOOP;
END $$;
