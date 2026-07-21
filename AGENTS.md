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

- `npm run dev`, dev server (Turbopack)
- `npm run build`, production build (must stay green)
- `npm test`, vitest (DAL isolation, entitlements, PayFast, extraction, KPI)
- `npm run db:generate` / `db:migrate` / `db:push`. Drizzle migrations
- `npm run seed`, demo agency workspace (needs DATABASE_URL)
- `npm run push:keys`, generate VAPID keys for web push

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
- Postgres via Drizzle (`src/server/db/schema.ts`; migrations in `/drizzle`, checked in).
- **All data access goes through the DAL** (`src/server/dal/*`). Every function takes a `Ctx` created by `withWorkspace()` which enforces session + workspace membership + role. Never query the db directly from routes/components. Isolation is tested in `tests/dal-isolation.test.ts` (PGlite).
- **Every table in `public` must have RLS enabled** (migration 0009). Supabase publishes `public` through PostgREST to the `anon`/`authenticated` roles, and RLS is the only wall in front of that API. We enable it deny-all (no policies); the app is unaffected because it connects as `postgres`, which has BYPASSRLS. A newly created table defaults to RLS OFF, so **any migration that adds a table must also `ENABLE ROW LEVEL SECURITY` on it**, or the Supabase advisor (and the hole) comes back. Tenant isolation still lives in the DAL; RLS is the second wall.
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
- Out of scope at any phase: two-way WhatsApp, docs/database system, automations builder, integrations marketplace, video calls.
