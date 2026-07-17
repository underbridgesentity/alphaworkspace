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

## Architecture

- Next.js App Router (v16, Turbopack), TypeScript strict, Tailwind v4 tokens in `src/app/globals.css`.
- Postgres via Drizzle (`src/server/db/schema.ts`; migrations in `/drizzle`, checked in).
- **All data access goes through the DAL** (`src/server/dal/*`). Every function takes a `Ctx` created by `withWorkspace()` which enforces session + workspace membership + role. Never query the db directly from routes/components. Isolation is tested in `tests/dal-isolation.test.ts` (PGlite).
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
- Phase 2 shipped for kpi_definitions/kpi_entries (scorecards) and time_entries (timers + quick logs), both Studio-gated via `can()`. `notes` still has no UI, do not build it without a decision.
- Out of scope at any phase: two-way WhatsApp, docs/database system, automations builder, integrations marketplace, video calls.
