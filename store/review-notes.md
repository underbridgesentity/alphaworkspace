# Review notes, both stores

Two things live here: **paste blocks** (verbatim text for App Store Connect's
App Review Information and Play's testing instructions) and the **work you have
to do before the paste blocks are true**.

Everything in a paste block is a factual claim to a reviewer. Work through the
verification gate first and delete any line you cannot tick. A note claiming a
capability the binary does not have is worse than no note at all.

---

## Part 1. The demo account. Do this first, it gates both stores.

Apple will not review an app behind a sign-in wall without working
credentials, and Play's testing instructions need the same. `src/proxy.ts`
bounces every unauthenticated visitor from `/app`, `/w/*`, `/account` and
`/onboarding` to `/sign-in`, so a reviewer sees nothing at all without an
account.

**The account must use a password, not a magic link.** A reviewer cannot read
your mailbox. The `Credentials("password")` provider is enabled unconditionally
in production (`src/server/auth.ts:57-77`), so email plus password works, but a
password can only be set from inside the account, so the order below matters.

**It must not expire.** Apple re-reviews on every update and comes back to the
same credentials months later. Put a calendar reminder on it.

### Steps

1. **Create a mailbox you control**, for example
   `appreview@alphaworkspace.co.za`. It has to be real: the first sign-in is a
   magic link.
2. **On the web, in an ordinary browser** (not the app), go to
   `https://www.alphaworkspace.co.za/sign-in` and sign in with that address by
   email link.
3. **Create the workspace.** With no workspaces, `/app` routes to `/onboarding`
   (`src/app/app/page.tsx`). Name it something a reviewer will read as a demo,
   for example `App Review Studio`.
4. **Set a password.** Account > **Password** > leave "Current password" empty
   (there has never been one), type a new password of at least 10 characters,
   **Save** (`src/app/account/page.tsx:399-438`, `POST /api/me/password`).
   Confirm it works: sign out, then sign in at
   `https://www.alphaworkspace.co.za/sign-in?mode=password`.
5. **Comp the workspace to Studio, so nothing is capped mid-review.** Go to
   `https://www.alphaworkspace.co.za/admin`. This is operator-only: access is
   `users.is_operator` or an email listed in the `OPERATOR_EMAILS` environment
   variable (`src/server/admin/operator.ts:27-44`), and a non-operator is
   redirected to `/app` (`src/app/admin/layout.tsx`). Find `App Review Studio`
   in the **Workspaces** table and change the **Plan** dropdown to **Studio**.
   That comps it directly with no PayFast charge
   (`setWorkspacePlanAdmin`, `src/server/admin/operator.ts:119-150`) and the
   table footer says so.
   - Sign in to `/admin` as **your own** operator account, not as the review
     account. Do not make the review account an operator: it would hand a
     reviewer the MRR dashboard and every workspace owner's email address.
6. **Seed it so it does not look empty.** Signed in as the review account,
   create by hand:
   - **three projects** with client names, one of them deliberately quiet so
     the weekly narrative has something to say
   - **ten to fifteen tasks** spread across To do, In progress and Done, with
     a few assigned and dated, including **one overdue** and **one due today**,
     so the coloured due-date rails and the morning brief have something to show
   - **two or three comments** on a task
   - **two or three private tasks** on My Work, so the private list is not empty
   - **one processed meeting**: record something short and harmless (read a
     paragraph aloud), let it transcribe and summarise, and confirm one action
     item into a task. This is the surface most likely to be probed, and an
     empty Meetings tab invites the question of whether the feature exists.
     Requires `DEEPGRAM_API_KEY` and `ANTHROPIC_API_KEY` in production; without
     Deepgram, meeting creation fails outright
     (`src/server/dal/meetings.ts:419-425`).
7. **Leave the meeting-bot add-on OFF** for this workspace (the **Bots** toggle
   in `/admin`). It is an add-on in no band with real per-minute vendor cost
   (`src/lib/plans.ts:18-20`), and a reviewer sending a bot into a call is a bill
   plus a support question. The paste blocks below therefore do not mention it.
   If you do enable it, add a line saying so and explaining that the bot joins
   as a clearly named, visible participant.
8. **Do not enable two-factor** on the account, and do not leave it in a state
   where deletion is blocked. Apple may test account deletion, and
   `deleteAccount` refuses when the user solely owns a workspace that still has
   other members (`src/server/dal/account.ts:81-98`). Keep the review workspace
   **single-member** so deletion is one clean path.
9. **Record the credentials** in App Store Connect (App Review Information >
   Sign-In Required) and in Play's testing instructions. Do not put them in this
   file or anywhere else in the repository.

---

## Part 2. Verification gate. Tick before pasting.

Each line maps to a sentence in a paste block. Verify against the **built
binary**, not the source, because the native shells were still being assembled
when these notes were written.

**Commerce-free (this is the whole basis of the Apple 3.1.3(f) claim)**

- [ ] Install the release build, sign in, and open **Settings > Billing**. It
      shows only the plan name and usage counts, with no price, no band cards,
      no checkout and no link out. Server-gated at
      `src/app/w/[ws]/settings/billing/page.tsx:14`, rendering
      `ShellPlanFacts`.
- [ ] Deep-link the shell to `/pricing`. It redirects to `/app`
      (`src/proxy.ts:16-23`).
- [ ] Fill the workspace to a limit (easiest: hit the free band's 2-project cap
      on a throwaway workspace) and read the dialog. It says "Limit reached" and
      "This workspace has reached its project limit", with no plan name, no
      price and no link (`src/components/app/upgrade-prompt.tsx:56-80`).
- [ ] The sidebar shows no upgrade card and no Billing entry
      (`src/components/app/sidebar.tsx:123-125, 242-245`).
- [ ] Search the rendered DOM of the running app for `R499`, `R999`,
      `payfast`, `upgrade` and `pricing`. Nothing. This is the check a reviewer
      does; the stripping is server-side so nothing should be hidden-but-present.

**Sign in**

- [ ] The sign-in screen inside the app offers **email link** and **password
      only**, with no "Continue with Google" button in the DOM. This is
      deliberate and server-gated: `oauthAllowed()`
      (`src/server/shell.ts:34-37`) returns false for any shell request.
      **This tick is what makes the Sign in with Apple paragraph true.** See
      Part 5.
- [ ] Signing in with email plus password works in the shell.
- [ ] The blurb above the form does not mention Google
      (`src/app/(auth)/sign-in/page.tsx:88-92` follows the button).

**Account deletion, guideline 5.1.1(v) and Play's equivalent**

- [ ] On a throwaway account inside the app: Account > Your data (POPIA) >
      Delete my account > type the email > **Delete forever**, and it actually
      succeeds. Read `store/privacy/CONTRADICTIONS.md` items 1 and 2 first;
      there is a foreign-key bug that makes this fail for some accounts.

**Native capabilities (the guideline 4.2 answer)**

Tick only what is in the build. Delete the corresponding sentence from the
paste block for anything unticked.

- [ ] **Share into the app.** Android: share text from another app and it lands
      in quick-add (`ACTION_SEND` filters in
      `android/app/src/main/AndroidManifest.xml:40-49`, handled by
      `AlphaSharePlugin.java`). iOS: the Share Extension hands text over the
      `alphaworkspace://share?text=` scheme (`CFBundleURLTypes` in
      `ios/App/App/Info.plist`).
- [ ] **Biometric app lock.** Face ID or fingerprint unlocks the app
      (`@aparajita/capacitor-biometric-auth`; `NSFaceIDUsageDescription` in
      `Info.plist`, `USE_BIOMETRIC` in the Android manifest).
- [ ] **Push notifications** actually arrive, on a real Android device and a
      real iPhone. The code is there
      (`src/server/notifications/channels/fcm.ts`,
      `src/lib/client/native-push.ts`, tokens in `native_push_tokens`), and both
      platforms go through **FCM**, with iOS reaching APNs through FCM. So this
      is a configuration check: Firebase project, `google-services.json`,
      `GoogleService-Info.plist`, the APNs key uploaded **into Firebase**, and
      `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` in production.
      `fcmConfigured()` fails closed and silently, so a missing variable looks
      exactly like a working app that never notifies anyone. Full setup in
      `store/PRE-FLIGHT.md` A4, A5 and A5b. If push is not shipping, delete the
      push sentence here and every push claim from both listings.
- [ ] **Offline.** Turn on airplane mode, open the app, read a cached board,
      create a task, watch it queue, turn the radio back on and watch it land
      (`public/sw.js`, `idb-keyval` outbox).
- [ ] **Microphone.** Voice capture and meeting recording work on device. **As
      of writing they cannot**: `RECORD_AUDIO` is absent from the Android
      manifest and `NSMicrophoneUsageDescription` is absent from `Info.plist`,
      and the webview's `getUserMedia`
      (`src/components/app/meeting-recorder.tsx:192`,
      `src/lib/client/transcription.ts:131`) will fail without them. See Part 4.

**If microphone does not ship in v1**, delete these from the listings:
- `store/listing/google-play-full-description.txt`: the "Talk, and the tasks
  appear." paragraph, the "Meetings, written up." paragraph, and the
  "Microphone:" line under PERMISSIONS.
- `store/listing/apple-description.txt`: the "TALK, AND THE TASKS APPEAR" and
  "MEETINGS, WRITTEN UP" sections, and the microphone sentence under GETTING
  STARTED.
- and hide those surfaces in shell mode the same way commerce is hidden, so a
  reviewer does not tap a microphone button that cannot work.

---

## Part 3. Paste block: App Store Connect

App Store Connect > your app > the version > **App Review Information** >
**Notes**.

```
WHAT THIS APP IS

Alpha Workspace is a project and work-management app for small teams, used
mainly in South Africa. This iOS app is the companion client for an existing
Alpha Workspace account. A reviewer signing in with the credentials above sees
a seeded demo workspace with projects, tasks, a private task list and one
processed meeting.

NO PURCHASING IN THIS APP (guideline 3.1.3(f))

This app is a free stand-alone companion to a paid web-based service, and it
contains no purchasing of any kind. There is no in-app purchase, no price, no
plan comparison, no checkout, no "upgrade" call to action and no link to any
purchase page anywhere in the binary.

This is enforced on the server, not hidden with CSS, because we assume you
inspect the rendered DOM. The webview appends a marker to its user agent
("AlphaShell/1 (ios)") and the server strips every commerce surface before the
HTML exists:

- The billing screen under Settings renders only the workspace's current plan
  name and its usage counts. The component that draws prices, plan cards,
  checkout and cancellation is never included in the response for this app.
- A deep link to the marketing pricing page redirects to the app home.
- When a workspace reaches a plan limit, the app says "Limit reached" and names
  the limit as a plain fact. It does not name a plan, quote a price, or offer a
  way to buy anything.
- The sidebar has no upgrade card and no billing entry.

Subscriptions are sold and managed only on our website, by people using an
ordinary web browser, and are billed in South African rand through PayFast, a
South African payment gateway. Nothing in this app steers a user there.

SIGN IN WITH APPLE IS NOT REQUIRED (guideline 4.8)

This app uses exclusively our own account system: a one-time email sign-in link
and an email-and-password option, both first-party. It offers no third-party or
social login service. The Google sign-in option that exists on our website is
deliberately not present in this app, and is removed on the server for the same
reason and by the same mechanism as the commerce surfaces, so no third-party
login button exists in the DOM.

THIS IS NOT A REPACKAGED WEBSITE (guideline 4.2)

The app uses a webview to render our product, because every screen is a React
Server Component behind a server-side data-access layer and a server-set
session cookie. On top of that it adds native capabilities the website cannot
provide, all of which a reviewer can exercise:

- Share Extension. Share text from Mail, Messages, Safari or any other app into
  Alpha Workspace and it arrives in the quick-add field with the text already
  in place, ready to become a task.
- Biometric app lock. Face ID or Touch ID locks the app, because a workspace
  contains private task lists and meeting recordings. The Face ID purpose
  string explains this.
- Push notifications. The morning nudge, mentions and assignments arrive as
  system notifications.
- Offline use. The app has a service worker cache and a write outbox. With the
  device in airplane mode you can open the app, read your board, and create or
  complete a task; the writes queue on the device and are sent when the
  connection returns. This is the app's central design constraint: it is built
  for South African mobile networks.
- Recording on the device. Meetings are recorded by the device itself, and
  voice capture uses the microphone to turn spoken notes into proposed tasks.

The navigation is locked to our own domain (limitsNavigationsToAppBoundDomains),
so this app cannot be used to browse the web.

MICROPHONE, AND WHY RECORDING IS CONSENT-FIRST

The microphone is used in exactly two places, both of which the user starts
explicitly: voice capture (hold to talk, and we propose tasks from what you
said) and meeting recording. Nothing is captured before the user taps record.
Recorded audio is uploaded to our private storage and transcribed by a
speech-to-text provider, and the transcript is summarised by an AI provider.
The app tells the user, in the product, to tell everyone in the room that they
are being recorded before starting. Meetings are private to the person who
recorded them, including from workspace administrators, until they choose to
share them.

AI NEVER CREATES OR CHANGES WORK ON ITS OWN

Voice capture and quick-add use a model to propose tasks, and meetings use one
to draft a summary and action items. In every case the proposals are shown to
the person and nothing is written until they confirm. This is a product rule,
not a setting.

ACCOUNT DELETION (guideline 5.1.1(v))

Account deletion is in the app: tap the avatar, top right, to open Account,
then "Your data (POPIA)", then "Delete my account". You type your own email
address to confirm and tap "Delete forever". It is a real deletion of the
account, not a deactivation. The same screen has "Export my data (JSON)".

One deliberate behaviour worth knowing: if the account is the sole owner of a
workspace that still has other members in it, deletion asks you to hand
ownership to someone else first, so that a team is not destroyed by one person
leaving. The review account owns a single-member workspace, so deletion is a
single clean path.

PRIVACY

We are the responsible party under South Africa's Protection of Personal
Information Act. The privacy policy is at
https://www.alphaworkspace.co.za/privacy and is also linked from the app's
sign-in screen.

CONTACT

[your name], [your email], [your phone]
Happy to answer anything or to walk through a build on a call.
```

**Before pasting**, replace the contact line, and delete any capability
paragraph you could not tick in Part 2. In particular, if microphone does not
ship, delete the "Recording on the device" bullet, the whole "MICROPHONE" section
and the voice-capture half of the AI section.

---

## Part 4. Paste block: Play Console testing instructions

Play Console > **App content** > **App access**. Choose **All or some
functionality is restricted**, add an instruction set, and paste this. Put the
credentials in the username and password fields, not in the instructions.

```
Alpha Workspace requires an account: everything past the sign-in screen is a
private team workspace, so an unauthenticated visitor sees only the sign-in
page.

HOW TO SIGN IN
1. Open the app.
2. Choose the "Password" tab on the sign-in screen.
3. Use the email address and password supplied with this instruction set.

There is no waiting on an email and no two-factor step. The account is
permanent and is not on a trial clock.

WHAT YOU WILL SEE
The account lands on My Work: a morning brief card, today's tasks with coloured
due-date rails, and a private task list below. The bottom tab bar reaches the
project board (drag cards between To do, In progress and Done), Pulse (the
weekly write-up and the KPI tiles), Meetings, and Account.

NO PURCHASES IN THIS APP
The app contains no purchasing surface: no prices, no plan comparison, no
checkout and no upgrade links. Subscriptions are sold only on our website, in
an ordinary browser. Nothing in the app links to them. The billing screen under
Settings states the workspace's current plan and usage as a fact and offers no
way to change it.

ACCOUNT DELETION
In the app: Account, then "Your data (POPIA)", then "Delete my account". You
confirm by typing your own email address. The same screen exports all of the
account's data as JSON.

OFFLINE
The app is built for patchy mobile networks. In airplane mode you can open it,
read a cached board and create or complete a task; writes queue on the device
and are sent when the connection returns.

MICROPHONE
Used only when the user starts a voice capture or records a meeting, both of
which require an explicit tap. Nothing is captured beforehand.
```

Delete the MICROPHONE paragraph if microphone does not ship in v1.

---

## Part 5. Android microphone: which of three shapes you are shipping

The Play requirement people remember, a foreground-service declaration with a
demonstration video, **only applies if you actually declare a foreground
service**. As of writing you do not:
`android/app/src/main/AndroidManifest.xml` has `INTERNET`,
`POST_NOTIFICATIONS` and `USE_BIOMETRIC`, **no `RECORD_AUDIO`, no
`FOREGROUND_SERVICE*` permission and no `<service>` element at all**. So pick
the shape deliberately.

### Shape A: no microphone in v1

Nothing to declare. Cheapest path to a first release.

- Do not add `RECORD_AUDIO`.
- Hide voice capture and meeting recording in shell mode, the same way commerce
  is hidden, so no reviewer and no user taps a button that cannot work.
- Delete every microphone and meeting claim from both listings (the exact list
  is in Part 2).

### Shape B: microphone, foreground only

Recording works while the app is on screen. Backgrounding the app or locking the
screen suspends it. This is what a webview `MediaRecorder` does on its own.

- Add `<uses-permission android:name="android.permission.RECORD_AUDIO" />` to
  the Android manifest and `NSMicrophoneUsageDescription` to `Info.plist`.
- Capacitor's `WebView` also needs the `onPermissionRequest` bridge to grant
  the webview's `getUserMedia` after the Android runtime permission is granted.
  Verify on a real device: a silent failure here looks exactly like a broken
  feature.
- **No foreground-service declaration and no video are required**, because there
  is no foreground service.
- Say nothing about background recording in the listing, and tell the user in
  the product that leaving the app pauses the recording.

### Shape C: microphone plus background recording

A real meeting recorder: recording continues while the user switches apps or
locks the screen. This is the version that triggers the Play declaration.

Manifest work:
- `RECORD_AUDIO`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_MICROPHONE`
- a `<service>` with `android:foregroundServiceType="microphone"`, started with
  `startForeground(..., FOREGROUND_SERVICE_TYPE_MICROPHONE)`

One constraint shapes the design and is easy to discover too late:
`RECORD_AUDIO` is a while-in-use permission, so **a microphone foreground
service cannot be started while the app is in the background**. It has to be
started from the foreground, when the user taps record, and then survive
backgrounding.

**The Play Console declaration.** Play Console > **App content** > the
**Foreground service permissions** declaration. For the microphone type you must
provide:

1. a description of the feature that uses it,
2. what the user loses if the system defers or interrupts the task,
3. **a link to a video demonstrating the feature**, and
4. the specific use case from Google's preset list. For microphone that is
   **Background Audio Access**.

**What the video has to show.** Not the feature in the abstract: the **path a
user takes in your app to trigger it**. A screen recording from a real device,
one take, no editing needed:

1. Open the app and sign in, or start already signed in.
2. Go to Meetings and tap to start a recording. Show the microphone permission
   prompt being granted the first time.
3. Show the recording running, with the elapsed timer moving.
4. **Show the persistent foreground-service notification appearing** in the
   shade. This is the point of the whole video: it evidences that the mic use
   is visible to the user.
5. **Press home to background the app.** Show the notification still there and
   the recording still running, ideally by pulling the shade down over another
   app.
6. **Lock the screen.** Wait a visible ten to twenty seconds. Unlock.
7. Return to the app, stop the recording, and show a recording whose duration
   covers the backgrounded and locked period. That duration is the proof.
8. Show the finished meeting with its transcript.

Keep it under two minutes, no music, no marketing. Narration or on-screen
captions naming each step help. Host it where the link will keep working:
YouTube unlisted or Google Drive with link access. Google does not publish
hosting requirements, so check what the Console accepts at declaration time.

Suggested wording for fields 1 and 2:

> **Feature.** Alpha Workspace records in-person meetings on the device so the
> app can transcribe them and draft the action items. Recording continues while
> the user puts the phone down, switches to another app to take a note, or locks
> the screen, which is what happens in every real meeting.
>
> **If deferred.** Recording never starts, and the meeting is lost. There is no
> retrospective capture.
>
> **If interrupted.** The recording is truncated at the point of interruption.
> The user loses the rest of the meeting and gets a partial transcript, which is
> worse than none because it reads as complete.

---

## Part 6. Two things that will be asked, with the honest answer ready

**"Why is this a webview?"** Because the product is server-rendered end to
end: every workspace screen is a React Server Component, all data goes through a
server-side access layer that enforces workspace membership, and auth is a
server-set session cookie. A bundled client build would mean forking the product
into a separate SPA against a JSON API and solving cross-origin cookies, and it
would ship a second codebase to keep in step. The reasoning is written up in
`capacitor.config.ts`. The native layer exists precisely so the app is more
than the website.

**"Is the meeting recording legal?"** South African law (RICA) permits
recording a conversation you are a party to. The product tells the user to tell
the room first, in the product and in the privacy policy, and the bot option
joins as a clearly named, visible participant. Meetings are private to their
creator by default, including from administrators, until shared
(`meetings.visibility` defaults to `private`,
`src/server/dal/meetings.ts:99-105`). Do not volunteer legal analysis in a
review note; this is here so you have the answer if asked.
