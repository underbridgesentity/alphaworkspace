# Apple App Privacy labels, answer sheet

Where: App Store Connect > your app > **App Privacy**.

Apple states this information is **required to submit new apps and app
updates**. It is entered by an Account Holder, Admin or App Manager, and can be
updated without shipping a new build.

Rules verified against <https://developer.apple.com/app-store/app-privacy-details/>,
August 2026.

Read `store/privacy/CONTRADICTIONS.md` before you submit.

---

## 0. How Apple's model differs from Google's, so you do not copy answers across

Three differences matter, and getting them backwards is how the two
declarations end up contradicting each other:

1. **Apple has no "shared with third parties" question.** The label asks what
   you collect, whether it is linked to identity, whether it is used to track,
   and for what purposes. Sending audio to Deepgram or text to Anthropic is
   **not** "sharing" in Apple's model and is **not** tracking.
2. **Your vendors' collection is your collection.** Apple's instruction is to
   identify all data you *or your third-party partners* collect. Deepgram,
   Anthropic, Supabase, Resend and Recall.ai do not create extra rows on the
   label; their collection folds into ours. This is the opposite of Google,
   where the service-provider carve-out lets you answer "not shared".
3. **Apple's "collect" has a real-time exemption.** Data transmitted off the
   device is collected if you or a partner can access it for **longer than is
   necessary to service the request in real time**. Meeting audio PUT to
   Supabase and fetched by Deepgram is retained well past real time, so it is
   collected. Do not try to use this exemption for the audio.

**Tracking is a flat No.** Apple defines tracking as linking data from this app
about a user or device with **third-party data** for targeted advertising or ad
measurement, or sharing it with a data broker. Neither happens: no advertising
SDK, no ad network, no data broker, and the CSP (`next.config.ts`) is
`default-src 'self'` with `connect-src` limited to the app's own origin and the
Supabase storage origin.

**The optional-disclosure carve-out does not apply to anything here.** Apple
requires **all four** of its conditions (not used for tracking; not used for any
advertising or other purpose; collected only infrequently, outside the app's
primary functionality, and optional for the user; provided in the UI with the
account name shown and an affirmative choice each time). Meeting recording is
core functionality and collection is ongoing after the permission prompt, so it
must be disclosed.

---

## 1. Data types collected

Every row below is **Data Linked to You** and **not used for tracking**. Apple
treats data that constitutes personal information under applicable privacy law
as linked, and everything here hangs off a workspace membership tied to a named
account.

### Contact Info

| Sub-type | Collected | Linked | Tracking | Purposes |
|---|---|---|---|---|
| **Name** | Yes | Yes | No | App Functionality |
| **Email Address** | Yes | Yes | No | App Functionality |
| Phone Number | No | | | |
| Physical Address | No | | | |
| Other User Contact Info | No | | | |

- Name: `users.name` (`src/server/db/schema.ts:89-107`). It also covers people
  who have no account: `meetings.speaker_names` maps real names onto diarised
  speakers (`schema.ts:498-559`), and `projects.client_name` holds a client's
  name.
- Email Address: `users.email`; `invites.email` (the address of someone who may
  never sign up); `verification_tokens.identifier`, the address the magic link
  is keyed on; and `subscriptions.last_itn`, which stores PayFast's callback
  verbatim including `name_first`, `name_last` and `email_address`
  (`src/server/payfast/itn.ts:124-126`).
- Purpose is App Functionality only. Notification emails are transactional
  product notifications, not marketing: there is no newsletter, no campaign
  tooling, and delivery is per-notification and user-tunable
  (`src/server/notifications/`). Do **not** tick Developer's Advertising or
  Marketing.

### User Content

| Sub-type | Collected | Linked | Tracking | Purposes |
|---|---|---|---|---|
| **Audio Data** | **Yes** | Yes | No | App Functionality |
| **Photos or Videos** | Yes | Yes | No | App Functionality |
| **Other User Content** | Yes | Yes | No | App Functionality |
| Emails or Text Messages | No | | | |
| Gameplay Content | No | | | |
| Customer Support | No | | | |

**Audio Data is the row that must not be softened.**

- The recorder captures device audio inside the webview
  (`src/components/app/meeting-recorder.tsx:155,192,223`) and PUTs it to the
  private Supabase bucket at `{workspaceId}/meetings/{meetingId}.{ext}`
  (`src/server/dal/meetings.ts:249`, `src/server/storage.ts:9`). `audio_path`,
  `mime`, `size_bytes` and `duration_sec` are persisted.
- It is then transcribed by **Deepgram**, which fetches the audio itself from a
  signed URL with a 3600 second TTL (`src/server/ai/transcribe.ts:102-106`, URL
  minted at `src/server/dal/meetings.ts:458-461`).
- The resulting transcript is summarised by **Anthropic**
  (`src/server/ai/meeting-summary.ts:47-52`).
- Voice-capture audio is also transmitted (raw bytes to Deepgram,
  `src/server/ai/transcribe.ts:50-54`) but is never stored: the route holds it
  in memory only and `voice_captures` has no audio column
  (`src/app/api/w/[ws]/ai/transcribe/route.ts:39-56`, `schema.ts:424-445`).
  Transmission is still collection, and the meeting recordings are retained
  regardless, so the row is Yes either way.
- Optional feature, but Apple has no "optional" flag. See section 0 on why the
  optional-disclosure carve-out does not apply.

Photos or Videos: task attachments accept `image/*`
(`src/components/app/attachments.tsx:112`). No `video/*` is accepted, but Apple
has one combined sub-type, so this row is Yes.

Other User Content: task titles and descriptions, project and client names,
labels, comments, notes, private task titles and notes, voice-capture and
meeting transcripts, meeting summaries and action items, and the AI-written
weekly narrative. Comments are covered here rather than under "Emails or Text
Messages", which Apple scopes to the user's own mail and messages, not
in-product commentary.

Customer Support is **No**: there is no in-app support form or chat. If a
support surface is ever added, this row changes.

### Identifiers

| Sub-type | Collected | Linked | Tracking | Purposes |
|---|---|---|---|---|
| **User ID** | Yes | Yes | No | App Functionality |
| **Device ID** | Yes | Yes | No | App Functionality |

- User ID: `users.id`, workspace and membership ids, and the Google
  `providerAccountId` with OAuth tokens in `accounts` (`schema.ts:109-130`).
- Device ID: two identifiers, both in this row.
  - **The native push token**, which is what the iOS build uses.
    `native_push_tokens` stores an FCM registration token per device with its
    `platform`, a `user_agent` string and `created_at` / `last_seen_at`
    (`src/server/db/schema.ts:614-632`, from
    `drizzle/0012_native_push_tokens.sql`). On iOS this reaches APNs **through
    FCM**, which is the standard Capacitor setup and is stated at
    `src/server/notifications/channels/fcm.ts:5-8`. So the token is handled by
    **Google** on the way to Apple, and Google should be named as an operator on
    the privacy page, which it currently is not
    (`CONTRADICTIONS.md` item 3).
  - **The web push endpoint**, for the browser PWA.
    `push_subscriptions.endpoint` with `p256dh`, `auth` and a truncated
    `user_agent` (`schema.ts:584-601`).
- **If push does not ship in v1**, answer Device ID **No** and delete the push
  claims from the listings at the same time. `fcmConfigured()` fails closed
  without `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL` and `FCM_PRIVATE_KEY`, so an
  unconfigured deployment genuinely collects no token.

### Usage Data

| Sub-type | Collected | Linked | Tracking | Purposes |
|---|---|---|---|---|
| **Product Interaction** | Yes | Yes | No | App Functionality, **Analytics** |
| Advertising Data | No | | | |
| Other Usage Data | No | | | |

- `activity_events` is an append-only record of every meaningful change, written
  inside the DAL (`schema.ts:391-420`). It is a product feature, not telemetry:
  the weekly narrative and the KPIs are computed from it, which is App
  Functionality.
- **Analytics is ticked deliberately.** The operator portal computes
  per-workspace last-activity timestamps and voice-capture counts from these
  rows (`src/server/admin/operator.ts:86-116`). That is analysis of user
  activity, even with no analytics SDK present. Declaring it is cheaper than
  arguing it.

---

## 2. Data types NOT collected

| Category | Answer | Why |
|---|---|---|
| **Health & Fitness** | No | No such feature. |
| **Financial Info** | No | The iOS binary contains **no** purchasing surface: `/pricing` redirects to `/app` for a shell request (`src/proxy.ts:16-23`) and the billing page renders `ShellPlanFacts` with no prices, checkout or links (`src/app/w/[ws]/settings/billing/page.tsx:14`). Card details never reach our servers even on the web: PayFast is a hosted redirect (`src/server/payfast/checkout.ts`). No card number, expiry or CVV exists in the schema. **Judgement call, flagged:** Apple's label is per app, and this app does not collect payment information. If a billing surface is ever added to the binary, this row changes and so does the 3.1.3(f) position. |
| **Purchases** | No | Purchase history is not collected from the user. `ShellPlanFacts` displays the current plan name as a fact; displaying is not collecting. |
| **Location** (Precise and Coarse) | No | No geolocation API anywhere. `next.config.ts` sets `Permissions-Policy: geolocation=()`. `workspaces.settings.timezone` is a value the owner types, not derived location. |
| **Sensitive Info** | No | Apple scopes this to racial or ethnic data, sexual orientation, pregnancy, disability, religious or philosophical beliefs, trade union membership, political opinion, genetic and biometric data. None is collected as a category. Free text and recorded speech can of course contain anything, but Apple's label covers data types you set out to collect, not incidental content. |
| **Contacts** | No | No contacts permission, no contacts plugin. Invites are typed email addresses, declared under Contact Info. |
| **Browsing History** | No | Not collected. The webview is locked to the app's own domain by `ios.limitsNavigationsToAppBoundDomains` (`capacitor.config.ts`). |
| **Search History** | No | In-app search exists but nothing persists it; no table holds it. |
| **Diagnostics** (Crash Data, Performance Data, Other) | No | **No crash or performance SDK exists.** `package.json` has no Firebase, Crashlytics, Sentry, PostHog, Segment, Mixpanel, Amplitude, Datadog, `@vercel/analytics` or `@vercel/speed-insights` dependency. A repo-wide grep returns only a comment in `scripts/seed.ts` and an uninstalled optional peer of `drizzle-orm`. **Note:** if you ever enable Xcode/TestFlight crash reporting sharing, that is Apple's own collection under its own agreement, not yours, and does not change this row. |
| **Surroundings** (Environment Scanning) | No | Not a spatial app. |
| **Body** (Hands, Head) | No | Not a spatial app. |
| **Other Data** | No | |

---

## 3. The two supporting declarations

**Privacy Policy URL** (required): `https://www.alphaworkspace.co.za/privacy`
Source: `src/app/(marketing)/privacy/page.tsx`. Public, no sign-in required.
Guideline 5.1.1(i) also expects a privacy policy link **inside the app**. That
is satisfied: the sign-in screen links to `/privacy`
(`src/app/(auth)/sign-in/page.tsx:108`) and so does the auth layout footer
(`src/app/(auth)/layout.tsx:18`), and every user passes through sign-in. The
**signed-in shell does not link it** (no reference in
`src/components/app/sidebar.tsx` or `src/app/account/page.tsx`), which is worth
fixing so a reviewer already signed in can find it. See PRE-FLIGHT item B3.

**Privacy Choices URL** (optional): leave blank. There is no separate
opt-out portal; notification preferences and deletion both live in Account
settings inside the app.

---

## 4. Account deletion, guideline 5.1.1(v)

Apple requires deletion to be **initiable from inside the app**. Pointing at a
website is not sufficient for Apple, unlike Google, which requires both. The
requirement has been enforced since 30 June 2022; it is a current submission
gate, not a future deadline.

**Where it is, exactly, for the review notes:**

> Account (tap your avatar, top right) > **Your data (POPIA)** > **Delete my
> account** > type your own email address into the confirmation field >
> **Delete forever**.

Code: `src/app/account/page.tsx:304-341`, calling `DELETE /api/me`
(`src/app/api/me/route.ts:45-50`), implemented in
`src/server/dal/account.ts:74-101`. It is a genuine hard delete of the `users`
row, not a soft-delete or a deactivation flag. On success the client purges
local caches and the offline outbox and signs out
(`src/lib/client/purge.ts`).

**Two defects that will make a reviewer's test fail. Fix before submitting:**

- **Deletion can fail on a foreign key.** Seven foreign keys onto `users` are
  `ON DELETE no action` (`comments.author_id`, `tasks.created_by`,
  `projects.created_by`, `workspaces.created_by`, `invites.invited_by`,
  `kpi_definitions.created_by`, `kpi_entries.entered_by`, from
  `drizzle/0000_clumsy_luckman.sql`). A member of a workspace that survives the
  deletion who has ever commented or created a task there hits a violation and
  cannot delete their account. **The demo account you give Apple must not be in
  that state, and more importantly the bug should be fixed, because a reviewer
  who tries deletion and sees an error will reject under 5.1.1(v).**
- **Deletion also refuses outright** if the user solely owns a workspace that
  still has other members: `src/server/dal/account.ts:81-98` throws
  `ValidationError` telling them to hand over ownership first. That is a
  defensible product decision, but it means "delete my account" is not always
  one tap. **Say this in the review notes** rather than letting the reviewer
  discover it.
- **Uploaded files are orphaned.** Neither `deleteAccount` nor
  `deleteWorkspace` (`src/server/dal/workspaces.ts:132-135`) calls
  `deleteObject`, so task attachments and meeting audio stay in the Supabase
  bucket after the rows are gone. Apple does not test storage buckets, but the
  privacy page's "deletion actually deletes" is not currently true.

---

## 5. Consistency check against the privacy policy

Apple and Google both treat a label that contradicts the privacy policy as a
problem. The live policy at `src/app/(marketing)/privacy/page.tsx` conflicts
with the code in several places, all listed with fixes in
`store/privacy/CONTRADICTIONS.md`. **The labels above describe what the code
actually does.** Where the two differ, the policy is the thing that needs
changing, not these answers.
