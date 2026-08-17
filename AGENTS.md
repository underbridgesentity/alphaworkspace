<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Alpha Workspace

Multi-tenant project/work management SaaS for small South African agencies.
Positioning: "the workspace that does the following up", status reports
itself, tasks cost nothing to create, built for Android/expensive-data/patchy
connectivity, priced in rand.

## Commands

- `npm run dev:local`, dev server against the LOCAL database (use this one)
- `npm run dev`, dev server against whatever `.env.local` says, which is PRODUCTION
- `npm run build`, production build (must stay green)
- `npm test`, vitest (DAL isolation, entitlements, PayFast, extraction, KPI)
- `npm run db:generate` / `db:migrate` / `db:push`. Drizzle migrations
  (**production migrations do not run on deploy, and `db:migrate` alone aims at
  the wrong port**, see Migrating production below)
- `npm run db:migrate:local` / `seed:local` / `db:reset:local`, see Local development
- `npm run seed`, demo agency workspace (refuses a remote DATABASE_URL)
- `npm run push:keys`, generate VAPID keys for web push

## Local development

**`.env.local` points at PRODUCTION.** Plain `npm run dev` therefore edits the
live product, which is why the redesign shipped for weeks without anyone
looking at it. Use the local database instead:

```
createdb alphaworkspace_dev            # once
cp .env.dev-local.example .env.dev-local
npm run db:migrate:local               # replays the checked-in migrations
npm run seed:local                     # Mzansi Studio, 3 projects, 20 tasks
npm run dev:local                      # http://localhost:3000
```

`npm run db:reset:local` does the drop, recreate, migrate and seed in one go
(~2 minutes). It force-drops, so you can leave the dev server running: it
reconnects on the next request. It pins `-h localhost` on `dropdb`/`createdb`
so a stray `PGHOST` cannot aim that `--force` at a remote server.

Seeded sign-in, at `/sign-in`, **Password** tab:

```
lerato@mzansi.studio  /  local-dev-password      (owner)
```

`/sign-in?mode=password` opens straight on that tab. `thabo@` is admin,
`naledi@` and `sipho@` are members, same password. The workspace is put on the
`studio` band by the seed so every surface is visible (the free band's
2-project cap used to kill the seed on the third project).

After a reset, **sign out before signing back in**. Sessions are JWTs, so the
old cookie survives the database going away, and its `sub` now points at a user
id that no longer exists. The app reads that as a signed-in stranger and shows
"Create your workspace", which looks exactly like a failed seed. `/api/auth/signout`
clears it. (Worth noting that this is production behaviour too: a deleted user
holding a live JWT lands in onboarding rather than being signed out.)

**There is no dev auth bypass, deliberately.** Local sign-in goes through the
ordinary `Credentials("password")` provider that real users use: the seed just
writes a real bcrypt hash for the demo accounts. A bypass that could ever reach
production is worse than the inconvenience it solves, and this codebase already
had a first-class password path, so it needed no new auth surface at all.
Writing that hash is gated on four independent conditions in
`src/lib/local-db.ts` (`NODE_ENV !== "production"`, `ALPHA_LOCAL_DEV=1`, a
localhost `DATABASE_URL`, and an explicit `SEED_DEV_PASSWORD`), each of which
fails closed. `tests/local-dev.test.ts` asserts all of that, and asserts the
auth layer cannot even read the local-dev flag.

How the production database is kept out of reach:

- `scripts/with-local-env.ts` loads `.env.dev-local` and **refuses to spawn
  anything** unless `DATABASE_URL` is on localhost/127.0.0.1.
- It injects those values into the child process. `@next/env` never overwrites
  a key that is already in the environment, so `.env.dev-local` beats
  `.env.local` for the whole session. That is why it shadows every production
  secret **by name**, not just `DATABASE_URL`: a local session must not be able
  to charge live PayFast, send real email, or write to production storage. Add
  any new secret's name there too.
- `src/server/db/index.ts` asserts the same thing at connect time, so an
  override slipping through later still throws instead of reaching production.
- `npm run seed` refuses a non-local `DATABASE_URL` unless
  `SEED_ALLOW_REMOTE=true`.

Never edit `.env.local`, never copy values out of it, and never negate it in
`.gitignore`. `.gitignore` still ignores every `.env*` file; only the two
templates (`.env.example`, `.env.dev-local.example`) are negated, and neither
holds a secret. Note `.env.example` has never actually been committed, so a
fresh clone does not get it yet.

Blank keys in `.env.dev-local` mean Google sign-in, attachments, meetings audio
and web push show their documented "not enabled" state locally, and magic links
and outbound email print to the dev server console.

## Migrating production

**The deploy does not run migrations.** `build` is plain `next build`, so
pushing to main ships code against whatever schema the database already has.
Apply the migration yourself, and remember new code can meet an old schema in
that window: write DAL mutations so they are correct on both, which for
multi-statement deletes means one `db.transaction`.

**`DATABASE_URL` is the transaction pooler and must not be used for DDL.** It
ends in `:6543` (pgbouncer, transaction mode), which is right for a serverless
app and wrong for migrations: transaction mode keeps no session state, which is
what DDL, advisory locks and drizzle's `__drizzle_migrations` bookkeeping rely
on. `npm run db:migrate` reads that URL as-is, so it points at 6543 too.

Run migrations on the **session pooler**: same host and credentials, port
**5432**. Swap the port in-process, never by copying the URL out of
`.env.local`:

```js
const url = new URL(process.env.DATABASE_URL); url.port = "5432";
const sql = postgres(url.toString(), {
  max: 1, prepare: false,
  connection: { lock_timeout: "5s", statement_timeout: "120s" },
});
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
```

`lock_timeout` matters because drizzle wraps every pending migration in ONE
transaction, so locks taken by an early `ALTER` are held until the last
statement commits. Without it, one long-running query can make a migration
queue and every request queue behind it. With it the migration fails fast and
rolls back. Verify the result by querying `information_schema` and
`pg_constraint` afterwards rather than trusting the CLI's exit code.

## Product laws (override feature decisions)

1. The app is the single source of truth, external channels are outbound nudges only, never input surfaces.
2. Every feature must reduce follow-up messages between humans ("anti-noise").
3. AI never silently creates/modifies work, always extract → show → confirm.
4. Minimal and calm: few concepts, strong defaults, no settings mazes.
5. Fast on cheap phones: app shell interactive < 3s on 3G mid-range Android.

## Security

- **The platform's security invariants are enforced by the `security-guardian` agent** (`.claude/agents/security-guardian.md`). Run it before shipping any security-relevant change (auth, DAL, API routes, entitlements/billing, webhooks, storage, roles/visibility, headers/CSP, anything touching secrets or tenant data): `/security-review` (current diff) or `/security-review full` (whole-codebase sweep). It is read-only and reports findings + fixes ranked by severity. The five standing invariants: tenant isolation is absolute; money/entitlements can't be forged; secrets never leak; every boundary (auth, input, webhook, secret compare) is verified; privacy (POPIA) is respected. The test suite is the executable contract — when a gap isn't covered by a test, add one.

## Architecture

- Next.js App Router (v16, Turbopack), TypeScript strict, Tailwind v4 tokens in `src/app/globals.css`.
- **Functions must run next to the database.** `vercel.json` pins `regions: ["lhr1"]` because Supabase is in `eu-west-2` (London) and Vercel's unset default is `iad1` (Washington DC), which had every logged-in page crossing SA to Virginia to London and back, once per query, on a deliberately query-chatty DAL. If the database ever moves, move this with it. Note `vercel.json` is schema-validated at deploy time and rejects unknown keys, so it takes no comment fields.
- Postgres via Drizzle (`src/server/db/schema.ts`; migrations in `/drizzle`, checked in).
- **All data access goes through the DAL** (`src/server/dal/*`). Every function takes a `Ctx` created by `withWorkspace()` which enforces session + workspace membership + role. Never query the db directly from routes/components. Isolation is tested in `tests/dal-isolation.test.ts` (PGlite).
- **Every table in `public` must have RLS enabled** (migrations 0009 + 0010, enforced by `tests/rls.test.ts`). Supabase publishes `public` through PostgREST to the `anon`/`authenticated` roles, and RLS is the only wall in front of that API. We enable it deny-all (no policies). A newly created table defaults to RLS OFF, so **any migration that adds a table must also `ENABLE ROW LEVEL SECURITY` on it** — the test fails by name if you forget. 0010 also revoked Supabase's `ALTER DEFAULT PRIVILEGES` grants to anon/authenticated, which is what silently exposed all 27 tables in the first place. Any view added to `public` must be created `WITH (security_invoker = true)`, or it runs as its owner and bypasses RLS on its base tables.
- **RLS guards the Data API only, never the app.** We connect as `postgres`, which both owns the tables and has BYPASSRLS, so RLS never constrains an application query and will *never* catch a missing `workspaceId` filter. Tenant isolation lives in the DAL and is tested in `tests/dal-isolation.test.ts`. Do not let "RLS is on" become a reason to trust a query. Corollary: never repoint `DATABASE_URL` at a least-privilege role as "hardening" — reads would silently return zero rows instead of erroring.
- Anything naming the `anon`/`authenticated` roles in a migration must be guarded on the role existing (`pg_roles`), because tests run the same migrations against PGlite where those roles do not exist.
- `npm run db:push` is **dev-only**. It writes schema straight to the database without a migration file, so a table created that way has no RLS, never reaches CI, and silently diverges from what `tests/rls.test.ts` checks. Ship schema changes as migrations.
- **Money moves before entitlements do.** Never grant a band, feature or quota before the charge for it has landed. `changeBand` charges the pro-rata catch-up FIRST and only a successful charge patches the mandate and moves the plan; the previous order (grant, then charge) handed out the higher band free whenever the charge failed, and was farmable by upgrading then immediately downgrading.
- **In-place band changes are OFF unless `PAYFAST_PRORATION=true`.** They rest on two PayFast API calls whose success we currently read from `res.ok`, and PayFast reports business failures in the response BODY under HTTP 200, so a declined charge can read as paid. Before enabling: verify the real response shape against the PayFast sandbox, parse it rather than trusting the status code, persist a `billing_adjustments` row before charging (unique on subscription+plan+period, for idempotency and concurrency), and reconcile the `aw-adj-` ITN instead of discarding it, reverting the band on FAILED. With the flag unset everything falls back to the full checkout, which is the proven path.
- **Any mutation that moves money or entitlements must pass `queue: false` to `apiMutate`.** The offline outbox replays from the service worker with no tab open, so a queued billing or admin write applies silently long after the user was told it failed, and can revert a decision they made in between. This covers the three billing mutations and both `/api/admin` plan writes.
- **Signed storage URLs are bearer capabilities**: anyone holding one fetches the object with no session, membership check or audit trail. Keep TTLs tight and explicit per call site (see `signedDownloadUrl`); only machine fetches (Deepgram pulling a recording) get the long window.
- Auth.js v5 (`src/server/auth.ts`): Resend magic link + Google, JWT sessions. Route protection lives in `src/proxy.ts` (Next 16 renamed middleware.ts).
- API surface: JSON route handlers under `src/app/api/`, zod-validated at every boundary (`src/lib/validators.ts`). Client mutations go through the offline-aware fetch wrapper so writes queue when offline.
- AI: server routes only (`src/server/ai/*`). Extraction (voice + quick-add share it) returns schema-validated proposals, confirmation writes, never the AI. Weekly narrative + morning brief run via `/api/cron/*` guarded by CRON_SECRET.
- Notifications: `src/server/notifications/`, channel adapters (in-app, web push, Resend email, WhatsApp stub which is documented but NOT implemented by design).
- Entitlements: single config in `src/lib/plans.ts`, checked via `can()` / limit helpers. Plan changes are config changes, not code changes.
- Fonts: Instrument Sans self-hosted in `public/fonts` (chosen as the freely-licensed stand-in for Mobbin's M Saans). Brand assets in `public/brand`; regenerate icons with `npm run icons`.

## Conventions

- IDs are client-generatable UUIDs (offline-first creates).
- Every meaningful change writes an `activity_events` row (inside the DAL, single place). KPIs and the weekly narrative depend on this.
- Timezone for all product logic: Africa/Johannesburg (SAST). Prices in ZAR, VAT inclusive.
- Roles: owner > admin > member (enum extensible; a client role arrives in Phase 3).
- Phase 2 shipped for kpi_definitions/kpi_entries (scorecards) and time_entries (timers + quick logs). Paid bands (Team + Studio) share ALL features and differ only in quantities, per Joseph 2026-07-17; gate via `can()`/`assertFeature()` and derive plan names with `planWithFeature()`. `notes` still has no UI, do not build it without a decision.
- Meetings (M1, 2026-07-18): device-side recording only (mic, mic+tab-audio mix, or file upload), audio PUTs straight to Supabase, Deepgram transcribes BY URL (`transcribeUrlDiarized`, never through our functions), Claude summary degrades to transcript-only without ANTHROPIC_API_KEY. Meetings are PRIVATE BY DEFAULT: creator-only (admins included) until shared; linking a project forces workspace visibility; confirmed action items become ordinary workspace-visible tasks. Metered in minutes per month (`meetingMinutesPerMonth`), gate blocks only when the month is already spent so a finished recording is never lost. Caps: 2 h and 50 MB (the Supabase Free-tier per-file ceiling; in-app opus hits ~29 MB at 2 h; raise both `MEETING_MAX_BYTES` and `BUCKET_FILE_LIMIT` together once on Supabase Pro).
- Meetings M2/M3 (2026-07-18): speaker renaming (creator-only, `speaker_names` jsonb merge-patch), notes email to workspace members (creator-only, escaped at the route), recorder keeps a failed upload in memory for retry. Bots via Recall.ai (`src/server/meetingbot/recall.ts`): "meeting_bots" is an ADD-ON feature in no band, toggled per workspace in /admin (lives in the entitlements snapshot; re-enable after any plan change since snapshots get rewritten). Bot flow: sendBot → Recall joins as "Alpha Workspace notetaker" → Svix-signed webhook `/api/webhooks/recall` (raw-body verify, heavy work in `after()`) → MP3 copied to storage when ≤ 50 MB else transcribed straight from Recall's presigned URL (no playback). Needs RECALL_API_KEY + RECALL_WEBHOOK_SECRET (+ optional RECALL_REGION, default us-west-2); UI degrades to "not enabled" copy without them.
- Private tasks (2026-07-21): each member's personal list on My Work, in a SEPARATE `private_tasks` table so shared surfaces (board, search, KPIs, narrative, briefs) never touch it by construction. Owner-only wall like meetings (admins included, NotFoundError indistinguishable); NO activity_events for private items (the log is team-visible) — a documented exception to the "every meaningful change logs activity" rule; promotion is the one door out (creates an ordinary task via createTask, which logs normally, then deletes the private row). Included in the POPIA export. Private PROJECTS remain out of scope (would rewire every read surface).
- Native shell capability layer (2026-08-17): what makes the store binaries an app rather than a repackaged website (Apple 4.2 says push and sharing alone are not enough). Share target (Android intent filters plus `AlphaSharePlugin.java`, because Capacitor's bridge only forwards intents carrying a URI and ACTION_SEND carries EXTRA_TEXT; iOS needs a Share Extension target, see `ios/SHARE_EXTENSION_SETUP.md`), biometric app lock (`@aparajita/capacitor-biometric-auth`), native push (FCM), hardware back, external links to the system browser, theme-matched status bar. All of it hangs off `<NativeLayer />` in `src/components/providers.tsx`, which renders null and loads no chunk unless the UA marker is present, so the web bundle is untouched. Shell-only CLIENT code gates on `isNativeShell()` (`src/lib/client/native.ts`), the same marker `useShell()` reads, because /account and /admin have no WorkspaceProvider.
- Google sign-in is HIDDEN in shell mode (`oauthAllowed()` in `src/server/shell.ts`). Google answers `disallowed_useragent` to OAuth from an embedded webview, and offering a third-party login would pull in Apple guideline 4.8 (which would then require Sign in with Apple). Magic link and password are our OWN account system, which is what keeps 4.8 out of scope. Do not re-add it to the shell.
- Native push needs credentials nobody can generate from this repo: `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` on the server (a Firebase service account), `android/app/google-services.json` (absent; Gradle already applies the plugin conditionally and logs when it is missing), and for iOS a `GoogleService-Info.plist` plus an APNs key uploaded to Firebase and the Push Notifications capability added in Xcode. Missing any of them degrades to "not configured" and web push still delivers; nothing throws.
- Out of scope at any phase: two-way WhatsApp, docs/database system, automations builder, integrations marketplace, video calls.
