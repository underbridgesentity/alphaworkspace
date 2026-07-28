<p align="center">
  <img src="public/brand/logo-white.png" alt="Alpha Workspace" width="360" />
</p>

<p align="center"><strong>The workspace that does the following up.</strong><br/>
Status reports itself · tasks cost nothing to create · built for South Africa.</p>

---

Alpha Workspace is a multi-tenant project & work management platform for small
South African creative and digital agencies (2–15 people). Three pillars:

1. **It reports itself**, zero-setup KPIs, a weekly AI-written Monday briefing
   that reads like a sharp ops lead wrote it, and a personal morning brief.
2. **Capturing work costs nothing**, hold the mic after a client call, talk,
   review the extracted tasks, confirm. Or type
   `homepage concepts for Liberty, Thabo, Friday` and press enter.
   The AI always proposes; a human always confirms.
3. **Built for here**, offline-first installable PWA, light on data, priced
   in rand via PayFast, Cape Town data residency preferred.

**Product laws** (they override feature ideas): the app is the single source of
truth; every feature must reduce follow-up messages between humans; AI never
silently creates work; minimal and calm; fast on cheap phones.

## Stack

Next.js 16 (App Router, TypeScript strict, Turbopack) · Postgres via Drizzle ORM
· Auth.js v5 (magic link + Google) · Resend · Anthropic API · PayFast recurring
billing · hand-rolled service worker (offline reads + background-sync write
queue) · Tailwind v4 · vitest + PGlite (74 tests).

## Getting started

```bash
npm install
createdb alphaworkspace_dev              # a throwaway local Postgres
cp .env.dev-local.example .env.dev-local # local-only config, gitignored
npm run db:migrate:local                 # apply checked-in migrations
npm run seed:local                       # demo agency with 3 weeks of history
npm run dev:local
```

Sign in at `http://localhost:3000/sign-in` on the **Password** tab as
`lerato@mzansi.studio` with the `SEED_DEV_PASSWORD` from `.env.dev-local`
(`local-dev-password` by default). That is the ordinary password provider, not
a dev bypass. Magic links work too: without `RESEND_API_KEY` the link prints to
the dev server console.

If a maintainer's `.env.local` points at a deployed database, `npm run dev`
will talk to it. Prefer the `:local` scripts; see "Local development" in
`AGENTS.md` for the guards that keep them apart.

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres. On Supabase pick region **af-south-1 (Cape Town)** where available; use the transaction pooler URL. |
| `AUTH_SECRET` | `npx auth secret` |
| `NEXT_PUBLIC_APP_URL` | Canonical URL (links in emails, PayFast callbacks). |
| `CRON_SECRET` | Bearer token protecting `/api/cron/*`. |
| `GOOGLE_CLIENT_ID/SECRET` | Optional Google sign-in. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email + weekly digest. Console fallback in dev. |
| `ANTHROPIC_API_KEY` | Extraction + narrative. Without it, a deterministic heuristic parser and a template narrative keep every flow working. |
| `AI_MODEL_EXTRACTION` / `AI_MODEL_NARRATIVE` | Default `claude-haiku-4-5` / `claude-sonnet-4-6`. |
| `PAYFAST_MERCHANT_ID/KEY/PASSPHRASE`, `PAYFAST_SANDBOX` | Billing. `.env.example` ships PayFast's public sandbox credentials. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push, generate with `npm run push:keys`. |

### Deploying (Vercel)

1. Set all env vars; `vercel.json` registers the cron jobs
   (`/api/cron/weekly-narrative` Mondays 06:30 SAST, `/api/cron/morning`
   daily 06:00 SAST). Vercel sends `Authorization: Bearer $CRON_SECRET`.
2. Point PayFast's ITN notify URL at `https://your-app/api/webhooks/payfast`
   (it's also passed per-checkout).
3. `npm run build` must be green; the service worker (`public/sw.js`)
   registers automatically in production and makes the app installable.

## Commands

```bash
npm run dev:local      # dev server against the local database (preferred)
npm run dev / build / start
npm test               # vitest (PGlite, no database needed)
npm run lint
npm run db:generate    # regenerate migrations after schema changes
npm run db:migrate     # apply migrations
npm run db:migrate:local / seed:local / db:reset:local
npm run seed           # demo workspace
npm run push:keys      # VAPID key pair
npm run icons          # regenerate PWA icons from brand assets
```

## Architecture in one breath

Every query goes through the **DAL** (`src/server/dal`) which takes a `Ctx`
produced by `withWorkspace()`, session → membership → workspace scope; the
isolation tests in `tests/dal-isolation.test.ts` prove cross-tenant reads and
writes fail. Meaningful changes append to **`activity_events`**, which powers
the KPIs, the narrative and the audit trail. AI lives server-side only
(`src/server/ai`): extraction returns schema-validated proposals with
per-field confidence, and **only human confirmation writes tasks**. The client
is offline-first: reads are served by the service worker cache, writes queue
in IndexedDB and replay via Background Sync (last-write-wins; creates carry
client UUIDs so replays are idempotent). Entitlements are one config object
(`src/lib/plans.ts`), changing a plan is a config change. Phase 2 tables
(scorecards, time entries, notes) are in the schema, deliberately without UI.

More detail: [`AGENTS.md`](AGENTS.md) (project guide) and inline module docs.

## Security & POPIA

Workspace isolation in one place + tests · server-side role checks on every
mutation · rate limits on auth/AI/webhooks · secrets never reach the browser ·
voice audio is transcribed and discarded (transcripts only) · per-user JSON
export and deletion that actually deletes · consent language at signup ·
privacy policy at `/privacy`.

## Licence

Proprietary, all rights reserved. Instrument Sans is bundled under the SIL
OFL 1.1 (`public/fonts/OFL.txt`).
