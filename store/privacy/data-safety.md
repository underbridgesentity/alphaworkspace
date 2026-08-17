# Google Play Data Safety, answer sheet

Where: Play Console > **App content** > **Data safety**.

This is a legal declaration, and Play blocks new apps and updates while it is
incomplete or inconsistent. Every answer below is derived from this codebase and
cites the file it came from, so it can be re-checked when the code changes.
**Re-run this sheet before any release that adds a data type, a vendor, or a
permission.**

Read `store/privacy/CONTRADICTIONS.md` before you submit. Several statements on
the live privacy page do not match what the code does, and Play treats a Data
safety form that contradicts the privacy policy as a rejection reason.

Rules verified against
<https://support.google.com/googleplay/android-developer/answer/10787469>
(Data safety), <https://support.google.com/googleplay/android-developer/answer/13327111>
(account deletion), August 2026.

---

## 0. The two definitions everything turns on

**Collected** = data transmitted off the device. It does not matter whether you
keep it, and it explicitly includes anything sent by a **webview under the
app's control**, which is what this app is. Voice-capture audio leaves the
phone even though no audio row is ever written, so it is collected.

**Shared** = transferred to a third party. Google lists four transfers that do
**not** count as sharing, and the first one decides most of this form: a
transfer to a **service provider** that processes the data on the developer's
behalf and on the developer's instructions. (The others: legal process,
user-initiated transfers with prominent disclosure, and fully anonymised data.)

### The decision you must make before filling this in

Deepgram, Anthropic, Supabase, Resend, Vercel and Recall.ai are all
processors in the ordinary sense: they do a job we asked for and hand the
result back. Under Google's own definition that makes them service providers
and the honest answer to "Shared" is **No**.

**But the exception is contractual, not architectural.** A vendor that reuses
the data for its own purposes is not a service provider. Nothing in this
repository establishes the contractual position:

- `src/server/ai/transcribe.ts` sets **no** retention, redaction or opt-out
  parameter on any Deepgram request. The claim on the privacy page that
  Deepgram does not retain the audio rests entirely on Deepgram's terms.
- `src/server/ai/anthropic.ts` sets **no** zero-retention header. The privacy
  page's "not used to train AI models" rests entirely on Anthropic's
  commercial terms.

**So, before you tick anything, confirm each vendor's terms restrict them to
processing on Alpha Workspace's behalf:**

- [ ] Deepgram (speech to text)
- [ ] Anthropic (summaries, extraction, weekly narrative)
- [ ] Supabase (database and file storage)
- [ ] Resend (email delivery)
- [ ] Vercel (hosting)
- [ ] Recall.ai (only if the meeting-bot add-on is enabled for any workspace)

**If every box is ticked**, answer **Shared = No** everywhere below, which is
what the answers are written as.

**If you cannot confirm even one of them before submission day**, answer
**Shared = Yes** for every data type that reaches that vendor, and say so.
Over-declaring sharing is not a policy violation. Under-declaring it is, and it
is the most common cause of a Data safety enforcement action.

One vendor deserves a second look either way. **Recall.ai is not a back-office
processor**: its bot joins a live meeting as a visible participant and holds
the recording on its own infrastructure before we fetch it
(`src/server/meetingbot/recall.ts`, `src/server/dal/meetings.ts:546-551`). It
is an add-on that is in **no** pricing band and is off unless an operator turns
it on per workspace (`src/lib/plans.ts:18-20`, gate at
`src/server/dal/meetings.ts:486-500`). If it is off for every workspace at
submission time, say so in the review notes rather than trying to describe a
feature no user can reach.

---

## 1. Data collection and security (the first screen)

| Question | Answer | Evidence |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | Sections 2 and 3 |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | `next.config.ts` sets HSTS `max-age=63072000; includeSubDomains; preload` in production builds. `capacitor.config.ts` sets `cleartext: false`, `androidScheme: "https"`, `allowMixedContent: false`. Storage uploads and downloads use HTTPS signed URLs (`src/server/storage.ts`). Every vendor endpoint is HTTPS. |
| Do you provide a way for users to request that their data be deleted? | **Yes** | In-app: Account > "Your data (POPIA)" > "Delete my account" > type your email > "Delete forever" (`src/app/account/page.tsx:304-341`), calling `DELETE /api/me` (`src/app/api/me/route.ts:45-50`). **Read section 5 first. The deletion path has two defects that make this answer unsafe as it stands.** |
| Data deletion URL | `https://www.alphaworkspace.co.za/account` | **See PRE-FLIGHT item B2.** Google requires the URL to be functional, to make the deletion pathway prominent and discoverable on that page, and to reference the app or developer by name. This route is behind the sign-in wall (`src/proxy.ts` matcher includes `/account/:path*`), so a signed-out visitor lands on `/sign-in` instead. Fix before submitting. |
| Has your app been independently validated against a global security standard? | **No** | No such review exists. Do not tick this. |

---

## 2. Data types: COLLECTED

For each type Play asks: collected, shared, processed ephemerally, required or
optional, and the purposes. All five are given.

Purposes are drawn from Play's list: App functionality, Analytics, Developer
communications, Advertising or marketing, Fraud prevention security and
compliance, Personalisation, Account management.

### Personal info

**Name** — Collected **Yes** · Shared **No** (service providers) · Ephemeral
**No** · **Required** · Purposes: **App functionality, Account management**
- `users.name` (`src/server/db/schema.ts:89-107`).
- **Also covers people who are not users.** `meetings.speaker_names` maps real
  names onto diarised speakers, so meeting participants with no account get
  named in our database (`schema.ts:498-559`). `projects.client_name` holds a
  client's name (`schema.ts:245-246`). `invites.email` holds the address of
  someone who may never sign up (`schema.ts:209-231`).
- Reaches: Anthropic (member names are in every extraction and meeting-summary
  prompt, `src/server/ai/extraction.ts:41`,
  `src/server/ai/meeting-summary.ts:65`); Deepgram (member names, first names,
  project names, client names and label names are sent as `keyterm` query
  parameters on **every** transcription request,
  `src/server/ai/transcribe.ts:46-48, 98-100, 141-160`); Resend (names appear in
  notification and meeting-notes email bodies).

**Email address** — Collected **Yes** · Shared **No** · Ephemeral **No** ·
**Required** · Purposes: **App functionality, Account management**
- `users.email`; `invites.email`; `verification_tokens.identifier`, which is the
  address the magic link is keyed on (`schema.ts:140-151`); and
  `subscriptions.last_itn`, which stores PayFast's callback **verbatim**,
  including `name_first`, `name_last` and `email_address`
  (`src/server/payfast/itn.ts:124-126`, `schema.ts:629`).
- Reaches: Resend (every magic link and every notification email); Anthropic
  (member email addresses are inside extraction and meeting-summary prompts,
  which the privacy page does not currently mention, see CONTRADICTIONS item 6).

**User IDs** — Collected **Yes** · Shared **No** · Ephemeral **No** ·
**Required** · Purposes: **App functionality, Account management**
- `users.id`, workspace and membership ids, plus the Google
  `providerAccountId` and the OAuth `access_token` / `refresh_token` /
  `id_token` stored in `accounts` (`schema.ts:109-130`).
- Reaches: Anthropic (member ids are in prompts so the model can attribute
  action items); Recall.ai (meeting and workspace UUIDs only, as bot metadata,
  `src/server/dal/meetings.ts:524`).

**Not collected**: Address, Phone number, Race and ethnicity, Political or
religious beliefs, Sexual orientation, Other info.

### Financial info

**Answer No to every row in this section.**

- The binary contains no purchasing surface at all. `/pricing` redirects to
  `/app` for a shell request (`src/proxy.ts:16-23`), and the billing page
  renders `ShellPlanFacts`, which has no prices, no checkout and no links
  (`src/app/w/[ws]/settings/billing/page.tsx:14`).
- Card details never reach our servers in any case. PayFast is a hosted
  redirect: the browser POSTs a signed form straight to payfast.co.za
  (`src/server/payfast/checkout.ts`). No card number, expiry or CVV exists
  anywhere in the schema.
- `subscriptions.payfast_token` is a recurring-billing mandate token, not a
  payment instrument, and it is never collected from the user.
- **Judgement call, flagged.** The payer name and email inside
  `subscriptions.last_itn` are declared under Personal info above, not here.
  Play's "User payment info" means payment instruments. If this is queried, the
  answer is that the app never collects payment information and the
  subscription record holds an identifier plus an audit copy of the gateway's
  own callback.

### Messages

**Other in-app messages** — Collected **Yes** · Shared **No** · Ephemeral
**No** · **Optional** · Purposes: **App functionality**
- `comments.body`, free text between team members (`schema.ts:338-355`), and
  the notification payloads built from them (`notifications.payload`).
- Reaches: Resend, when a comment or mention produces an email
  (`src/server/notifications/channels/email.ts:27-32`); and the browser push
  services, which carry the encrypted payload
  (`src/server/notifications/channels/push.ts:40-57`).

**Not collected**: Emails, SMS or MMS. The app never reads the user's mailbox or
device messages. The WhatsApp channel is a documented stub that returns
`skipped:not-implemented` (`src/server/notifications/channels/whatsapp.ts:23-27`).

### Photos and videos

**Photos** — Collected **Yes** · Shared **No** · Ephemeral **No** ·
**Optional** · Purposes: **App functionality**
- Task attachments accept `image/*` and land in the private Supabase
  `attachments` bucket (`src/components/app/attachments.tsx:112`,
  `src/server/storage.ts:9,146,156`).

**Videos** — **No.** The attachment picker accepts images, PDF, Word, Excel,
PowerPoint and plain text. No `video/*` is accepted.

### Audio files

**Voice or sound recordings** — Collected **Yes** · Shared **No** (but read the
gate in section 0, and see the note below) · Ephemeral **No** · **Optional** ·
Purposes: **App functionality**

This is the most sensitive declaration on the form. Do not soften it, and **do
not tick "processed ephemerally"**.

- **Meeting recordings are stored.** The recorder captures device audio inside
  the webview (`src/components/app/meeting-recorder.tsx:155,192,223`) and PUTs
  it straight to the private Supabase bucket at
  `{workspaceId}/meetings/{meetingId}.{ext}` (`src/server/dal/meetings.ts:249`,
  `src/server/storage.ts:9`). `meetings.audio_path`, `mime`, `size_bytes` and
  `duration_sec` are persisted (`schema.ts:498-559`).
- **Voice-capture audio is transmitted but never stored.** The route reads the
  body into memory, calls Deepgram and returns the transcript; `voice_captures`
  has no audio column (`src/app/api/w/[ws]/ai/transcribe/route.ts:39-56`,
  `schema.ts:424-445`). Transmitting it off the device is still collection.
- **Because meeting audio is retained, the whole data type must be declared as
  collected and cannot be marked ephemeral**, even though voice-capture audio
  on its own would qualify. Play's ephemeral flag is per data type, not per
  feature.
- **Where the audio goes.** Deepgram, for speech to text: voice capture sends
  the raw bytes in the request body, meetings send a **signed URL and Deepgram
  fetches the audio itself** (`src/server/ai/transcribe.ts:50-54, 102-106`; URL
  minted at `src/server/dal/meetings.ts:458-461` with a 3600 second TTL). In
  the bot fallback path Deepgram is handed Recall.ai's own presigned MP3 URL
  (`meetings.ts:620`). Supabase stores the objects. Recall.ai records the call
  itself when the add-on is on.
- **The transcript derived from the audio goes to Anthropic** for summarisation
  (`src/server/ai/meeting-summary.ts:47-52`). It is declared under "Other
  user-generated content" below, but a reviewer will read the two together, so
  keep the story consistent.
- **If the section-0 gate is not cleared, this is the first row to switch to
  Shared = Yes.**

**Music files: No. Other audio files: No.**

### Files and docs

**Files and docs** — Collected **Yes** · Shared **No** · Ephemeral **No** ·
**Optional** · Purposes: **App functionality**
- PDF, Word, Excel, PowerPoint and plain text attachments, with the original
  filename kept in `attachments.name` (`schema.ts:681-712`), stored in the
  private Supabase bucket.

### App activity

**App interactions** — Collected **Yes** · Shared **No** · Ephemeral **No** ·
**Required** · Purposes: **App functionality, Analytics**
- `activity_events` is an append-only log of every meaningful change, written
  inside the DAL (`schema.ts:391-420`). It is a product feature rather than
  telemetry: the weekly narrative and the KPIs are computed from it.
- **Analytics is listed as a second purpose deliberately.** The operator portal
  computes per-workspace last-activity and voice-capture counts from these rows
  (`src/server/admin/operator.ts:86-116`). That is analytics on user activity,
  even though no analytics SDK exists. Declare it rather than argue it.

**Other user-generated content** — Collected **Yes** · Shared **No** ·
Ephemeral **No** · **Required** · Purposes: **App functionality**
- Task titles and descriptions, project names, client names, labels, notes,
  private task titles and notes, voice-capture transcripts, meeting transcripts
  and summaries, action items, and the AI-written weekly narrative.
- Reaches: Anthropic (transcripts, meeting content, weekly activity summaries);
  Deepgram (project, client and label names as keyterms); Supabase (storage);
  Resend (the meeting-notes email carries the summary, decisions, risks and
  action items,
  `src/app/api/w/[ws]/meetings/[meetingId]/email/route.ts:40-75`).

**In-app search history: No.** Search exists in the UI but nothing persists it;
no table holds it. **Installed apps: No. Other actions: No.**

### Device or other IDs

**Device or other IDs** — Collected **Yes** · Shared **No** · Ephemeral **No** ·
**Optional** · Purposes: **App functionality**

**This is the data type the store apps add. There are now two device
identifiers, on two transports.**

- **Native push token (this is the one that matters for the store builds).**
  `native_push_tokens` stores an FCM registration token per device, with the
  `platform` (`android` or `ios`), a `user_agent` string, `created_at` and
  `last_seen_at` (`src/server/db/schema.ts:614-632`, created by
  `drizzle/0012_native_push_tokens.sql`). The token is `UNIQUE` and rotates, so
  a device re-registers rather than accumulating rows. It cascades on user
  delete.
- **Web push endpoint**, for the browser PWA. `push_subscriptions.endpoint` is a
  per-install identifier issued by the browser's push service, stored with the
  client's `p256dh` and `auth` keys and a truncated `user_agent` string
  (`schema.ts:584-601`, `src/app/api/push/subscribe/route.ts:19`).
- **Reaches Google either way.** Native push goes through **FCM HTTP v1** for
  both platforms: Android talks to FCM directly and **iOS reaches APNs through
  FCM** (`src/server/notifications/channels/fcm.ts:5-8`). Web push goes to
  whichever service issued the endpoint (Google for Chrome and Android, Mozilla,
  Apple). All of them are service providers for delivery, and all of them see
  the token or endpoint plus the delivery metadata; the notification title and
  body travel with it
  (`src/server/notifications/channels/push.ts:40-57`).
- **Google must therefore be named as an operator on the privacy page**, which
  it currently is not. `CONTRADICTIONS.md` item 3.
- **If push does not ship in v1**, this data type may be answered **No** for the
  store builds, since `fcmConfigured()` fails closed without
  `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL` and `FCM_PRIVATE_KEY`. Delete the push
  claims from the listings at the same time. Do not declare a token you do not
  collect, and do not claim a feature you did not ship.

---

## 3. Data types: NOT collected

Answer **No** to all of these. The reasons are recorded here in case a reviewer
or an auditor asks later.

| Type | Why not |
|---|---|
| **Location** (approximate and precise) | No geolocation API is used anywhere. `next.config.ts` sets `Permissions-Policy: geolocation=()`, disabling it at the browser policy level. `workspaces.settings.timezone` is a value the owner types, not a derived location. |
| **Health and fitness** | No such feature. |
| **Financial info** | See section 2. |
| **Calendar events** | The app has a calendar *view* over its own task due dates. It never reads the device calendar, and no calendar permission or plugin is installed. |
| **Contacts** | No contacts permission, no contacts plugin. Invites are typed email addresses, declared under Personal info. |
| **Web browsing history** | Not collected. The webview is locked to the app's own domain (`ios.limitsNavigationsToAppBoundDomains` in `capacitor.config.ts`). |
| **Crash logs, Diagnostics, Other app performance data** | **No crash or analytics SDK exists.** `package.json` has no Firebase, Crashlytics, Sentry, PostHog, Segment, Mixpanel, Amplitude, Datadog, `@vercel/analytics` or `@vercel/speed-insights` dependency. A repo-wide grep for those names returns only a comment in `scripts/seed.ts` and an uninstalled optional peer of `drizzle-orm`. The `com.google.gms:google-services` plugin is referenced in `android/build.gradle` but applied conditionally, and no `google-services.json` exists, so it is inert. |

**Two things Play does not require you to declare, recorded so nobody
"corrects" this later:**

1. **IP addresses are not collected by the app.** `x-forwarded-for` is read in
   exactly three places, all in `src/app/(auth)/sign-in/actions.ts:26-28,
   55-57, 89-91`, and only as a key into an in-memory rate-limit map
   (`src/server/ai/ratelimit.ts:8`). Nothing is persisted or logged. Vercel and
   Supabase keep their own platform access logs containing IPs; that is
   infrastructure outside the app's control and outside this form's scope, and
   the privacy page already discloses "standard server logs kept briefly".
2. **Google avatar images are hotlinked.** `src/components/ui/avatar.tsx:37-45`
   renders `<img src={googleusercontent URL} referrerPolicy="no-referrer">`, so
   rendering an avatar sends the viewer's IP to Google's CDN. That is a
   third-party network request, not a data type the app collects. It belongs on
   the privacy page (CONTRADICTIONS item 3) but changes no answer above.

---

## 4. Target audience, ads and families

| Question | Answer | Note |
|---|---|---|
| Target age groups (App content > Target audience and content) | **18 and over, only** | A workplace tool. Selecting only the 18+ band keeps the app out of the Families policy entirely and avoids the ads-and-content requirements that follow from including any under-18 band. |
| Is your app designed for children? | **No** | |
| Committed to follow the Play Families Policy | **Do not tick** | Only applies if a child age band is selected. |
| Contains ads (App content > Ads) | **No** | Verified: no advertising SDK, and the CSP is `default-src 'self'` with `connect-src` limited to the app origin and the Supabase storage origin (`next.config.ts`), so no ad network could load even if one were added. |
| Government app | **No** | |
| Financial features | **None** | The binary has no purchasing, lending, payments or crypto surface. |
| Does your app allow users to create accounts? | **Yes** | Which is what triggers the account-deletion requirement above. |
| News app | **No** | |

---

## 5. Two defects in the deletion path, to fix before ticking "users can request data deletion"

Both live in code owned by other people. Neither is in scope for this package,
but shipping the declaration without fixing them means declaring something that
is not reliably true, on a form Google enforces.

**5a. Account deletion can fail on a foreign key.**
`deleteAccount` (`src/server/dal/account.ts:74-101`) hard-deletes the `users`
row. Most references cascade or null out, but seven foreign keys onto `users`
are `ON DELETE no action`: `comments.author_id`, `tasks.created_by`,
`projects.created_by`, `workspaces.created_by`, `invites.invited_by`,
`kpi_definitions.created_by`, `kpi_entries.entered_by`
(`drizzle/0000_clumsy_luckman.sql`). A member of a workspace that survives the
deletion, who has ever left a comment or created a task there, will hit a
foreign key violation. The delete fails and the user cannot delete their
account. **This is exactly the scenario a store reviewer tests.**

**5b. Stored objects are orphaned.**
Neither `deleteAccount` nor `deleteWorkspace`
(`src/server/dal/workspaces.ts:132-135`) calls `deleteObject`. **Task
attachments and meeting audio remain in the Supabase bucket after the account
or workspace row is gone.** `deleteObject` is only called on an explicit
per-meeting audio delete (`src/server/dal/meetings.ts:855,874`) and on
oversize-upload cleanup. The privacy page's promise that "deletion actually
deletes" is not currently true for uploaded files or meeting audio.

Minor, worth noting: `verification_tokens` has no foreign key to `users`, so an
outstanding magic-link token keyed on a deleted email survives until it
expires.

---

## 6. Vendor summary, for the narrative and for the privacy policy

| Vendor | Receives | Why | Code |
|---|---|---|---|
| Supabase | The whole database, plus attachment and meeting-audio objects in a private bucket | Database and file storage | `src/server/db/index.ts`, `src/server/storage.ts` |
| Vercel | Request handling for every page and API call, region pinned to London | Application hosting | `vercel.json` |
| Deepgram | Voice-capture audio bytes; meeting audio fetched by signed URL; a keyterm list of member, project, client and label names | Speech to text | `src/server/ai/transcribe.ts` |
| Anthropic | Meeting transcripts, typed and spoken capture text, weekly activity summaries, and every workspace member's id, name and email address | Summaries, task extraction, weekly narrative | `src/server/ai/meeting-summary.ts`, `extraction.ts`, `narrative.ts` |
| Recall.ai | Meeting join URL, a bot name, and internal meeting and workspace UUIDs; records and holds the call audio | Optional notetaker bot, an add-on in no band | `src/server/meetingbot/recall.ts` |
| Resend | Recipient email address, subject and body, including magic-link sign-in URLs and meeting summaries | Transactional email | `src/server/email/send.ts` |
| PayFast | `name_first`, `email_address`, amount, workspace and plan identifiers | Payments, **web only, never in the app** | `src/server/payfast/checkout.ts` |
| Google | OAuth sign-in profile and tokens; avatar CDN requests; push delivery for Chrome and Android endpoints | Sign-in, avatars, push | `src/server/auth.ts:47-57`, `src/components/ui/avatar.tsx`, `src/server/notifications/channels/push.ts` |
| Mozilla, Apple | Web push endpoint and delivery metadata for their browsers | Push | same |

The morning brief involves **no** AI vendor at all: `src/server/ai/brief.ts` is
string templating with no Anthropic client import (confirmed at
`src/server/jobs/morning.ts:65-69`). Do not describe it as an AI feature in any
store material.
