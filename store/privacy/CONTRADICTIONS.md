# Where the privacy policy and the code disagree

Both stores treat a privacy declaration that contradicts the privacy policy as a
problem: Play says the Data safety form must be consistent with the policy, and
Apple's App Privacy answers are read against it too. So these are not academic.

Every item below was found by reading the code, not by reading the policy. The
policy lives at `src/app/(marketing)/privacy/page.tsx` and renders at
`https://www.alphaworkspace.co.za/privacy`.

**None of these files are in this package's scope.** They are listed here so
that whoever owns the privacy page and the DAL can fix them, and so that nobody
"harmonises" the store declarations by copying the policy's wording. Where the
two differ, the store declarations in this directory describe the code, and the
**policy** is the thing that needs changing.

Ordered by how likely each one is to cause an actual problem.

---

## 1. Deletion does not delete everything the policy says it deletes

**The policy says** (Your rights): you can delete your account or your whole
workspace, "deletion actually deletes, including transcripts, reports and
activity history".

**The code says:**

- `activity_events.actor_id` is `ON DELETE set null`
  (`drizzle/0000_clumsy_luckman.sql`), and the table's own header comment
  (`src/server/db/schema.ts:386-390`) says it is append-only and deliberately
  survives task and project deletion. **Activity history is retained, with the
  person's link removed.** That is a reasonable design, and it is defensible
  under POPIA as de-identification, but it is not what the sentence promises.
- Neither `deleteAccount` (`src/server/dal/account.ts:74-101`) nor
  `deleteWorkspace` (`src/server/dal/workspaces.ts:132-135`) calls
  `deleteObject`. **Task attachments and meeting audio stay in the Supabase
  bucket** after the account or workspace row is gone. `deleteObject` is only
  called on an explicit per-meeting audio delete
  (`src/server/dal/meetings.ts:855,874`) and on oversize-upload cleanup.
- `verification_tokens` has no foreign key to `users`, so an outstanding
  magic-link token keyed on a deleted email survives until it expires.

**Fix:** delete the storage objects in both deletion paths, and reword the
sentence to say what is true, for example that activity history is retained
without any link to the person. Deleting stored audio matters most: it is the
most sensitive thing the product holds.

**Store impact:** Play requires the deletion mechanism to delete "user data
associated with the app account", with retention allowed only for stated
legitimate reasons. Orphaned meeting audio is not a stated reason.

---

## 2. Account deletion can fail outright

**The policy implies** deletion always works.

**The code:** `deleteAccount` hard-deletes the `users` row
(`src/server/dal/account.ts:100`), but seven foreign keys onto `users` are
`ON DELETE no action`: `comments.author_id`, `tasks.created_by`,
`projects.created_by`, `workspaces.created_by`, `invites.invited_by`,
`kpi_definitions.created_by`, `kpi_entries.entered_by`
(`drizzle/0000_clumsy_luckman.sql`). **A member of a workspace that survives the
deletion, who has ever left a comment or created a task there, hits a foreign
key violation and cannot delete their account.**

Separately, and by design, deletion refuses when the user solely owns a
workspace that still has other members
(`src/server/dal/account.ts:81-98`), telling them to hand over ownership first.

**Fix:** null or reassign the `no action` references before the user delete, and
add a test that a non-owner member with comments and created tasks can delete
their account.

**Store impact:** high. This is the single thing most likely to fail a hands-on
reviewer check, on both stores. Apple guideline 5.1.1(v) requires in-app account
deletion; a reviewer who taps "Delete forever" and gets an error will reject.

---

## 3. The vendor list omits Google, and omits the push services

**The policy says** (Who else touches data): Supabase, Vercel, Resend,
Anthropic, Deepgram, Recall.ai, PayFast.

**The code adds:**

- **Google, for sign-in.** The Google OAuth provider is configured in
  `src/server/auth.ts:47-57`, and the returned `access_token`, `refresh_token`,
  `id_token`, `scope` and `providerAccountId` are stored in the `accounts` table
  (`src/server/db/schema.ts:109-130`).
- **Google's CDN, on every avatar render.**
  `src/components/ui/avatar.tsx:37-45` hotlinks the `googleusercontent.com`
  avatar URL, so viewing a teammate's avatar sends the viewer's IP address to
  Google. The CSP explicitly permits it (`next.config.ts:32`).
- **Google's Firebase Cloud Messaging, for the store apps' push.** Native push
  goes through FCM HTTP v1 on both platforms, and **iOS reaches APNs through
  FCM** (`src/server/notifications/channels/fcm.ts:5-8`). So the device token
  and the notification title and body pass through Google even for iPhone
  users. Tokens are stored in `native_push_tokens`
  (`drizzle/0012_native_push_tokens.sql`).
- **Browser push services (Google, Mozilla, Apple), for the web PWA.** Web push
  necessarily routes through the service that issued the endpoint
  (`src/server/notifications/channels/push.ts:50-57`), which sees the endpoint
  and the delivery metadata even though the payload is encrypted.

**Fix:** add Google to the operator list, covering sign-in, avatar hosting and
push delivery, and mention "your browser's push service" for the web.

**Store impact:** moderate. It is an omission rather than a false statement, but
Play's Data safety form asks about exactly these flows, and an inconsistency
between the form and the policy is a documented rejection reason.

---

## 4. The voice-capture story is the wrong way round

**The policy says** (Voice capture): "Where your browser supports it, that
happens on your device; otherwise the audio is sent to our transcription
provider (Deepgram)."

**The code does the opposite.**
`createTranscriptionProvider` (`src/lib/client/transcription.ts:193-204`)
returns the **server** provider whenever the server advertises transcription and
the browser can record, and only falls back to the on-device Web Speech
provider otherwise. The workspace bootstrap sets `serverTranscribe` from
`transcriptionConfigured()`, which is simply `Boolean(DEEPGRAM_API_KEY)`
(`src/server/ai/transcribe.ts:23-25`, `src/server/bootstrap.ts`). The call site
passes the server slug unless an internal `forceOnDevice` fallback fires
(`src/components/app/voice-capture.tsx:62-65`).

So in any deployment with a Deepgram key, **Deepgram is the default and
on-device is the fallback**, not the reverse.

**Fix:** reverse the sentence, or change the code to match it.

**Store impact:** low on its own, but it feeds item 5, which is not low.

---

## 5. "Audio never leaves the phone" is not true of the Web Speech fallback

`src/lib/client/transcription.ts:6-7` says of the on-device provider that
"audio never leaves the phone". In Chrome and Chromium,
`webkitSpeechRecognition` **streams microphone audio to Google's speech
servers**. It is a browser-provided cloud service, not an on-device model.

**Mitigating, and important for the store labels:** this concerns the **web**
app, not the store binaries. Neither the Android System WebView nor iOS
WKWebView implements the Web Speech API, so inside the Capacitor shell
`transcriptionSupported()` is false and the Deepgram path is the only one
available. **Verify this on a real device before relying on it** (PRE-FLIGHT
item C4) rather than trusting the reasoning.

**Fix:** correct the comment, and add Google to the policy's operator list for
the web app (item 3 covers the same fix).

---

## 6. RESOLVED (commit 416efd0): Anthropic received every member's email address

**Fixed at the source rather than disclosed.** The roster in both prompts is
now `${m.name ?? m.email.split("@")[0]}`, so no address is sent, and the
fallback for a member with no name set (every magic-link signup until they fill
it in) sends the local part rather than the address. The privacy page and
data-safety.md both say so, and `tests/ai-extraction.test.ts` asserts the built
prompt contains no `@`.

The original finding is kept below for the record.

**The policy says** (AI processing): transcripts and weekly activity summaries
are processed through Anthropic's API.

**The code sends more than that.** Both the extraction prompt
(`src/server/ai/extraction.ts:41`) and the meeting-summary prompt
(`src/server/ai/meeting-summary.ts:65`) build a member roster line of the form
`- {id} :: {name} <{email}>`, unconditionally, for **every** member of the
workspace. So every voice capture, every quick-add and every meeting summary
sends the whole team's email addresses to Anthropic, whether or not the content
mentions anyone.

**Fix:** either drop the email from those prompts (the model is matching names,
and the id is what comes back) or say plainly in the policy that member names
and email addresses are included so the AI can attribute work to the right
person. The first option is better: it is the same feature with less data
leaving.

**Store impact:** moderate. It does not change any label answer, since Contact
Info > Email Address is already declared, but it is a POPIA minimisation point
and the kind of thing an Information Regulator complaint would land on.

---

## 7. Deepgram receives the workspace's roster of human and client names

Every transcription request appends up to 90 `keyterm` query parameters built
from each member's full name and first name, every project name, every client
name and every label name (`src/server/ai/transcribe.ts:46-48, 98-100`,
`keytermsFrom` at `:141-160`). This is accuracy biasing, and it works, but it
means **names of people and of client companies are sent to Deepgram in the URL
query string on every request**, independent of what the audio contains. Email
addresses are passed into the function but are not used as keyterms, which is
good.

**Fix:** disclose it, or narrow the keyterm list. Query strings are the worst
place for names because they land in more logs than request bodies do.

---

## 8. The Deepgram no-retention claim is not enforced in code

**The policy says** the audio sent to Deepgram "is not retained by them
afterwards".

**The code sets no such instruction.** `src/server/ai/transcribe.ts` builds its
query parameters at lines 37-44 and 89-97 and sets no retention, redaction or
opt-out flag on either call path. The claim therefore rests entirely on
Deepgram's contractual terms and account configuration.

The same applies to "This data is not used to train AI models" for Anthropic:
`src/server/ai/anthropic.ts` sets no zero-retention header, so that too rests on
the commercial terms.

**Fix:** confirm both contractual positions in writing before submitting the
Data safety form, since the service-provider carve-out that lets you answer
"not shared" depends on exactly this. See `data-safety.md` section 0. If either
vendor offers a per-request retention control, set it.

---

## 9. The JSON export is not the complete record the policy implies

**The policy says** you can "export your data as JSON (Account > Your data >
Export)".

**What the export contains** (`exportUserData`,
`src/server/dal/account.ts:20-72`): user profile, memberships, tasks assigned to
you, tasks you created, comments, voice captures, notifications, private tasks.

**What it omits:** meetings, including transcripts, summaries, speaker names and
audio; attachments; time entries; notes; activity events; billing records; push
subscriptions; KPI definitions and entries; daily briefs.

The omission of **meeting transcripts** is the notable one: it is the most
personal content the product holds and it is not in the subject's own export.

**Fix:** add meetings (at least the transcript, summary and action items for
meetings the user created), attachments metadata, notes and time entries. Or
narrow the policy's wording. `AGENTS.md` states private tasks are "included in
the POPIA export", and they are, so the intent is clearly completeness.

---

## 10. PayFast's raw callback is stored, including payer name and email

`subscriptions.last_itn` stores the entire PayFast ITN payload verbatim
(`src/server/payfast/itn.ts:124-126`, column at `src/server/db/schema.ts:629`),
which in PayFast's ITN specification includes `name_first`, `name_last` and
`email_address`. Nothing redacts it.

The policy's statement that "card details go directly to PayFast and never touch
Alpha's servers" is **true** and worth keeping. It is just not the whole
picture: the payer's name and email are persisted in our database for audit.

**Fix:** either redact the personal fields before writing `last_itn`, keeping the
payment identifiers and amounts that make it useful for audit, or note the audit
copy in the policy. Redaction is better; the audit value is in the ids and
amounts.

---

## 11. Small, no store impact, worth knowing

- The policy's "Installs from the browser" framing in the marketing copy
  (`src/components/marketing/sections/built-for-here.tsx`) says the app installs
  "without an app store". Once the store builds ship, that line is out of date
  on the web page. It is marketing copy, not a privacy statement, and it is not
  in a store listing, so it breaks nothing. Worth updating for its own sake.
- The policy says questions can go to "the operator of this deployment" without
  giving an address. Both stores require a working support contact. See
  PRE-FLIGHT item B1.
