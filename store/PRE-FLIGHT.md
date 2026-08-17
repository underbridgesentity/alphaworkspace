# Pre-flight: everything that must be true before you press Submit

Four sections. **A** is things only you can do, off the machine. **B** is
blockers that live in the product and are not fixed yet. **C** is verification
against the built binary. **D** is the per-store submission checklist.

Nothing here is optional in the sense of being nice to have. Each line is either
a hard store gate or a thing that has caused a rejection for somebody.

Rules verified August 2026. Where a rule may have moved, the item says so.

---

## A. Only you can do these

### A1. Apple Developer Program membership, active
- 99 USD a year, and it must be paid and active before a build can be uploaded.
- If it is enrolled as an **Individual**, the App Store shows your personal
  name as the seller. Enrolling as an **Organisation** shows the company name
  and requires a D-U-N-S number, which takes days to weeks to obtain if you do
  not have one.
- Decide this before you build anything. Changing it later means a new account.

### A2. Google Play developer account, registered as an **Organisation**
- 25 USD, once.
- **This choice is worth two weeks.** Play's testing requirement, a closed test
  with at least **12 testers opted in continuously for 14 days** before you can
  apply for production access, applies to **personal developer accounts created
  after 13 November 2023**. Organisation accounts are not subject to it.
- So: organisation account, no closed-testing gate, but D-U-N-S lead time.
  Personal account, no D-U-N-S, but recruit 12 to 15 real testers on real
  devices and wait 14 days, then apply for production and wait for a human
  review. There is no way to buy your way past this.
- Flagged as uncertain: third-party reports through 2026 say Play also rejects
  production applications for insufficient tester *engagement*, with no
  published threshold. If you go the personal-account route, assume the testers
  have to actually use the app, not just accept the invitation.

### A3. Signing
- **Android.** Enrol in **Play App Signing** (the default for new apps). You
  hold the upload key; Google holds the app signing key. Keep the upload
  keystore and its passwords somewhere you will still have them in three years.
  Losing the upload key is recoverable through Google support; losing an
  unenrolled app signing key is not.
- **iOS.** A Distribution certificate and an App Store provisioning profile for
  `za.co.alphaworkspace.app`. Xcode's automatic signing handles this once the
  account is active.
- **Register the bundle ID / package name first**, both as
  `za.co.alphaworkspace.app` (`capacitor.config.ts:26`,
  `android/app/build.gradle:7`). It cannot be changed after the first release
  on either store.

### A4. Firebase, which is how native push works here

Push in the store shells goes through **FCM HTTP v1**, for both platforms:
Android talks to FCM directly, and iOS reaches APNs **through** FCM. That is
stated in `src/server/notifications/channels/fcm.ts:5-8`, and it decides the
whole setup, so do not configure APNs directly in the app.

- **Firebase project**, with both apps registered under
  `za.co.alphaworkspace.app`.
- **Android**: download `google-services.json` into `android/app/`.
  `android/app/build.gradle` applies the `google-services` plugin
  **conditionally** and logs "google-services.json not found... Push
  Notifications won't work", so nothing breaks without it and nothing works
  either.
- **iOS**: download `GoogleService-Info.plist` into the Xcode project, enable
  the **Push Notifications** capability on the App ID and on the target, and add
  `remote-notification` to `UIBackgroundModes`.
- **A5 is the APNs key, and it goes to Firebase, not to your own server.**

### A5. APNs authentication key, uploaded into Firebase
- Apple Developer > Certificates, Identifiers & Profiles > **Keys** > new key
  with **Apple Push Notification service (APNs)** enabled.
- **The `.p8` file downloads exactly once.** Save it before closing the tab, and
  record the Key ID and your Team ID with it.
- Upload it in **Firebase Console > Project settings > Cloud Messaging > Apple
  app configuration**. Without it, iOS registers a token and every notification
  is dropped silently.

### A5b. Server credentials for FCM
From the Firebase **service account** JSON, set three environment variables in
production (names from `src/server/notifications/channels/fcm.ts:15-17`):

```
FCM_PROJECT_ID     = project_id
FCM_CLIENT_EMAIL   = client_email
FCM_PRIVATE_KEY    = private_key   (paste the PEM verbatim; the literal \n
                                    escapes are unescaped in code)
```

Absent credentials mean the channel reports "not configured" and everything else
carries on (`fcmConfigured()`), so a missing variable looks like silence rather
than an error. **Add all three names to `scripts/with-local-env.ts` as well**, per
the standing rule in `AGENTS.md` that a local session must not be able to reach
production services.

If push is **not** shipping in v1, skip A4, A5 and A5b and delete every push
claim from both listings, both review-note blocks, and the Device IDs rationale
in `store/privacy/data-safety.md`.

### A6. The permanent review demo account
- Full steps in `store/review-notes.md` Part 1. It must use a **password** (a
  reviewer cannot read your mailbox), be comped to **Studio** through the
  operator portal at `/admin`, be seeded with three projects, a dozen or so
  tasks, comments, private tasks and one processed meeting, and be a
  **single-member** workspace so account deletion is a clean path.
- **Do not let it expire and do not delete it.** Apple comes back to the same
  credentials on every update, months later.
- Do not make it an operator account: `/admin` would show a reviewer the MRR
  dashboard and every workspace owner's email address.

### A7. The Play App Signing SHA-256 fingerprint, then redeploy assetlinks.json
- `public/.well-known/assetlinks.json` ships with an obvious placeholder,
  because the real fingerprint does not exist until Google has signed your first
  upload.
- **Where to find it:** Play Console > select the app > **Test and release** >
  **Setup** > **App integrity** > the **App signing** tab > **App signing key
  certificate** > the **SHA-256 certificate fingerprint**. Copy it with its
  colons, uppercase hex.
- Paste it over the placeholder string in
  `public/.well-known/assetlinks.json`, replacing
  `REPLACE_WITH_SHA256_FROM_PLAY_CONSOLE_APP_SIGNING_SEE_store_README_STEP_A7`,
  and **redeploy the site.** The file is served from `public/`, so it ships with
  the web deploy.
- Add the **upload key** fingerprint to the same array as a second entry if you
  want locally-signed builds to verify too. It is on the same page.
- **This is not urgent for v1**, and the reason is worth knowing: Digital Asset
  Links verification only applies to `http` or `https` intent filters carrying
  `android:autoVerify="true"`. The Android manifest currently has **no https
  intent filter at all**: deep links use the custom scheme `alphaworkspace://`
  (`android/app/src/main/AndroidManifest.xml:57-62`). So the file changes nothing
  today. Ship it anyway: it has to exist before an App Link is added, Google
  caches asset-link lookups, and an empty `/.well-known/` is a thing people
  forget for months.
- Verification, once the real fingerprint is in place:
  ```
  curl -sI https://www.alphaworkspace.co.za/.well-known/assetlinks.json
  ```
  Expect `200`, `content-type: application/json`, and **no** `301` or `302`.
  Redirects break verification outright.
- **If an https App Link is ever added**, serve the file at every hostname in
  the intent filters. An apex-to-`www` redirect breaks the apex. And think
  before claiming the whole domain: `handle_all_urls` would route
  `alphaworkspace.co.za/pricing` into the app, where the shell redirects
  `/pricing` to `/app`, so a pricing link from an email would dead-end.

### A8. Screenshots
- Capture recipe and the exact viewports are in `store/assets/README.md`
  section 4. **Nothing under `public/marketing/shots/` is uploadable as-is.**
- Five iPhone shots at **1320 x 2868**, five Play phone shots at
  **1080 x 1920**.
- Read section 4a first: the existing shot script downscales anything over
  300 KB, which would silently produce an invalid size that App Store Connect
  rejects on upload.

### A9. The foreground-service demonstration video, only if you ship background recording
- Required only under Shape C in `store/review-notes.md` Part 5, that is, only
  if the Android build declares a microphone foreground service. As of writing
  the manifest declares no service at all, so this is not needed.
- If it is needed, the shot list is in Part 5. The proof the video has to
  deliver is a recording whose final duration covers a period when the app was
  **backgrounded and the screen was locked**.

---

## B. Blockers in the product. None of these are fixed.

Each is owned by someone else. Each one either blocks a store gate or makes a
statement in the listing untrue.

### B1. There is no support page and no published support contact. **P0, both stores.**
Apple's **Support URL is required** and must actually offer a way to get help. A
404, or a redirect to the marketing homepage, is a rejection. Play requires a
**contact email address** to publish at all.

The site has neither. A repo-wide search finds no `mailto:`, no support address
and no contact page. The privacy policy says to "email the operator of this
deployment" without giving an address
(`src/app/(marketing)/privacy/page.tsx:120-124`).

**DONE.** `/support` is built and live, publishing `info@underbridges.co.za`,
which already exists and is already read. Neither store requires the support
address to be on the app's own domain: Apple wants a reachable Support URL with
a way to contact a human, Play wants a support email on the listing. The
address is defined once in `src/lib/contact.ts` and rendered from there on
/support, /privacy and /delete-account, so it cannot go stale on one of them.

**Do not** point the Support URL at `/privacy`. It is not support.

### B2. The account-deletion URL is behind the sign-in wall. **P0, Play.**
Play requires a **web** page where a user can request account deletion, on top
of the in-app path, precisely so somebody who has uninstalled the app can still
ask. The URL must be functional, must make the deletion pathway prominent and
discoverable on that page, and must reference the app or developer by name.

`https://www.alphaworkspace.co.za/account` fails the first test: `src/proxy.ts`
matches `/account/:path*` and bounces a signed-out visitor to `/sign-in`.

**Fix, smallest version:** a short public section on `/privacy` (or a
`/delete-account` page) that names Alpha Workspace, states that deletion is at
Account > Your data (POPIA) > Delete my account, gives the support address as
the alternative route, and says what is deleted and what is retained. Then point
the Data safety field at that URL.

### B3. Account deletion can fail, and it can refuse. **P0, Apple.**
Apple guideline 5.1.1(v) requires working in-app deletion, and reviewers test
it. Two behaviours:

- **It can fail on a foreign key.** Seven foreign keys onto `users` are
  `ON DELETE no action`, so a member of a surviving workspace who has ever left
  a comment or created a task there hits a violation and cannot delete.
  Full detail in `store/privacy/CONTRADICTIONS.md` item 2.
- **It refuses by design** when the user solely owns a workspace that still has
  other members (`src/server/dal/account.ts:81-98`). That is defensible, and the
  review notes disclose it, but the demo account must not be in that state.

**Also fix, though no reviewer will catch it:** deletion leaves task attachments
and meeting audio in the Supabase bucket. `CONTRADICTIONS.md` item 1.

### B4. The privacy policy contradicts the code in nine places. **P1, both stores.**
Both stores treat a privacy declaration inconsistent with the policy as a
problem, and Play names it as a rejection reason. The full list, with fixes and
file references, is `store/privacy/CONTRADICTIONS.md`. The four that matter most:

- deletion does not delete everything the policy says it does (item 1)
- the vendor list omits Google entirely: OAuth, avatar hotlinking, push (item 3)
- the voice-capture story is reversed: Deepgram is the default, not the fallback
  (item 4)
- every workspace member's email address is sent to Anthropic in every
  extraction and every meeting summary, undisclosed (item 6)

### B5. Microphone is not permitted in either native shell. **P0 if the listing claims it.**
`android/app/src/main/AndroidManifest.xml` has no `RECORD_AUDIO` and
`ios/App/App/Info.plist` has no `NSMicrophoneUsageDescription`. The webview's
`getUserMedia` calls (`src/components/app/meeting-recorder.tsx:192`,
`src/lib/client/transcription.ts:131`) cannot succeed without them.

Pick a shape from `store/review-notes.md` Part 5 and then make the listings
match. If microphone is out, delete the voice-capture and meeting paragraphs
from both descriptions and hide those surfaces in shell mode, so nobody taps a
button that cannot work.

### B6. iPad is declared but not designed for. **P1, Apple.**
`ios/App/App.xcodeproj/project.pbxproj` has
`TARGETED_DEVICE_FAMILY = "1,2"`. Declaring iPad makes 13" iPad screenshots
mandatory and invites a 4.2 quality judgement on a layout nobody has looked at.
Set it to `"1"` for v1 unless somebody has actually reviewed the app at 1032
points wide. `store/assets/README.md` section 2b has both paths.

### B7. Vendor data-processing terms are unconfirmed. **P1, Play.**
The Data safety answers say **Shared = No** on the strength of Google's
service-provider exception. That exception is contractual, and nothing in the
repository establishes it: `src/server/ai/transcribe.ts` sets no Deepgram
retention flag and `src/server/ai/anthropic.ts` sets no zero-retention header.
Confirm the terms for Deepgram, Anthropic, Supabase, Resend, Vercel and (if
enabled) Recall.ai, or switch those answers to **Shared = Yes**. Checklist in
`store/privacy/data-safety.md` section 0.

### B9. The generated App Store icon has an alpha channel. **P0, Apple, one-line fix.**
App Store Connect rejects an app icon containing an alpha channel, and the icon
`scripts/generate-native-assets.mjs` writes into
`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` currently
has one. Verified on the generated file: `1024x1024 channels=4 hasAlpha=true`.

The script does call `.flatten({ background: INK })` and comments that Apple
rejects alpha, but in `sharp` a pipeline that contains a `composite()` keeps a
fourth channel through `flatten()`. Reproduced both ways:
`composite + flatten` gives `channels=4`,
`composite + flatten + removeAlpha` gives `channels=3`.

**Fix**, in `icon()` in `scripts/generate-native-assets.mjs`:

```js
if (flatten) image = image.flatten({ background: INK }).removeAlpha();
```

then `npm run icons:native` and re-check. Detail and the verification command are
in `store/assets/README.md` section 1. A correct file is sitting at
`store/assets/appstore-icon-1024.png` if you want to unblock an upload today,
but the generator will overwrite it on the next run.

### B8. The signed-in app does not link the privacy policy. **P2, Apple.**
Guideline 5.1.1(i) expects a policy link inside the app. It is on the sign-in
screen (`src/app/(auth)/sign-in/page.tsx:108`) and the auth layout
(`src/app/(auth)/layout.tsx:18`), which every user passes through, so this is
probably already satisfied. Adding a line to the Account page would remove the
argument.

---

## C. Verify against the built binary, not the source

The native shells were still being assembled while this package was written.
Install the actual release build and check each of these.

- [ ] **C1. Commerce.** Settings > Billing shows plan name and usage only. A
      deep link to `/pricing` lands on `/app`. A plan-limit dialog names no
      plan, no price and no link. No upgrade card and no Billing entry in the
      sidebar. Then search the running app's DOM for `R499`, `R999`, `payfast`,
      `upgrade`, `pricing`: nothing. The full check list is
      `store/review-notes.md` Part 2.
- [ ] **C2. No third-party login button** in the app's sign-in DOM.
      `oauthAllowed()` (`src/server/shell.ts:34-37`) strips Google for every
      shell request. This is the single tick that makes the Sign in with Apple
      paragraph in the review notes true, so check it in the DOM, not by eye.
- [ ] **C3. Email plus password sign-in works** inside the shell, with the real
      review credentials, on a real device.
- [ ] **C4. Voice capture takes the Deepgram path, not the browser's.** Inside
      the webview, `transcriptionSupported()` should be false, since neither
      Android System WebView nor iOS WKWebView implements the Web Speech API,
      and the server path should be used. It matters because Chrome's Web
      Speech API streams microphone audio to **Google**, which is not in the
      privacy policy's vendor list. Verify on device rather than trusting the
      reasoning. `CONTRADICTIONS.md` item 5.
- [ ] **C5. Account deletion completes** from inside the app, on a throwaway
      account, without an error. B3.
- [ ] **C6. Push actually arrives** on a real Android device and a real iPhone,
      or every push claim is deleted from both listings, both review-note blocks
      and the Device IDs rationale in the privacy documents. Native push is
      implemented (`src/server/notifications/channels/fcm.ts`,
      `src/lib/client/native-push.ts`, `native_push_tokens` from
      `drizzle/0012_native_push_tokens.sql`), so this is a configuration check,
      not a code check: A4, A5 and A5b all have to be in place, and
      `fcmConfigured()` fails closed and silently when they are not.
      Android 13+ also needs the `POST_NOTIFICATIONS` runtime grant to be
      accepted, which the manifest now declares.
- [ ] **C7. Share into the app works.** Android: share text from another app,
      it lands in quick-add. iOS: the Share Extension over
      `alphaworkspace://share?text=`.
- [ ] **C8. Biometric lock works** and the Face ID prompt shows the purpose
      string from `Info.plist`.
- [ ] **C9. Offline works.** Airplane mode: open the app, read a cached board,
      create a task, watch it queue, reconnect, watch it land.
- [ ] **C10. The UA marker is present in the shipped build.**
      `appendUserAgent` must still be `AlphaShell/1 (ios)` and
      `AlphaShell/1 (android)` (`capacitor.config.ts:43,48`). **Every commerce
      and login gate in the product keys off this string.** Change it without
      changing `shellPlatform()` (`src/lib/shell.ts:23`) and the store binaries
      silently regain prices and a Google button, which is a 3.1.3(f) and a 4.8
      violation in one edit.
- [ ] **C11. `npm run build` is green and `npm test` passes.** The apps load the
      live site, so a bad web deploy is a bad app for every installed user at
      once. There is no app-side rollback.
- [ ] **C12. The version and build numbers are set.**
      `android/app/build.gradle` currently has `versionCode 1` and
      `versionName "1.0"`. Every Play upload needs a higher `versionCode` than
      the last; every App Store upload needs a higher `CFBundleVersion` within
      the same `CFBundleShortVersionString`.

---

## D. Per-store submission checklist

### Apple

- [ ] App record created in App Store Connect with bundle ID
      `za.co.alphaworkspace.app`
- [ ] Name `Alpha Workspace` (15 of 30), Subtitle `It does the following up`
      (24 of 30)
- [ ] Description, promotional text and keywords pasted from `store/listing/`
- [ ] Support URL live and answering (B1)
- [ ] Marketing URL, Privacy Policy URL set
      (`store/listing/apple-urls-and-contact.txt`)
- [ ] Category Productivity, secondary Business
- [ ] Age rating completed, expected 4+, user-generated content answered **yes**
      with the note that it is private to an invited team
- [ ] **App Privacy labels completed** from
      `store/privacy/apple-privacy-labels.md`. This is a submission gate.
- [ ] Five screenshots at 1320 x 2868, no alpha channel
- [ ] iPad screenshots at 2064 x 2752, **or** `TARGETED_DEVICE_FAMILY = "1"` (B6)
- [ ] 1024 x 1024 icon in the asset catalog, no alpha channel
- [ ] App Review Information: demo email and password, and the notes block from
      `store/review-notes.md` Part 3, with the contact line filled in and any
      unticked capability paragraph deleted
- [ ] Export compliance answered. The app uses HTTPS only and no proprietary
      cryptography, which is the standard exemption. Answer the questions, do
      not guess.
- [ ] Content rights: the app contains no third-party content
- [ ] Build uploaded, processed, and **selected for the version**. A build that
      finished processing is not attached until you attach it.

### Google Play

- [ ] App created, package name `za.co.alphaworkspace.app`
- [ ] Store listing pasted from `store/listing/google-play-*.txt`
- [ ] App icon 512 x 512 with alpha, feature graphic 1024 x 500
- [ ] At least 2 phone screenshots, 5 recommended, at 1080 x 1920
- [ ] Contact email live (B1), website set
- [ ] Privacy policy URL set under App content
- [ ] **Data safety form completed** from `store/privacy/data-safety.md`,
      including the data deletion URL (B2). This is a submission gate.
- [ ] **App access**: restricted, with the credentials and the instruction block
      from `store/review-notes.md` Part 4
- [ ] Ads: **No**
- [ ] Content rating questionnaire completed
- [ ] Target audience: **18 and over only**
- [ ] Government app: No. Financial features: none.
- [ ] News app: No
- [ ] Foreground service permissions declaration: **not applicable** unless you
      shipped Shape C. If you did, the declaration plus the video (A9).
- [ ] Countries: South Africa to start
- [ ] Play App Signing enrolled, upload keystore backed up (A3)
- [ ] If the developer account is personal: closed test complete, 12 testers,
      14 consecutive days, production access approved (A2)
- [ ] After the first upload: real SHA-256 into `assetlinks.json`, redeploy (A7)

---

## The five most likely rejections, in order

1. **No working Support URL.** B1. A hard Apple gate, and there is nothing to
   point at today.
2. **Account deletion errors when the reviewer tries it.** B3. Apple tests this.
3. **A commerce surface survives somewhere in the binary.** C1. The whole
   3.1.3(f) position rests on the DOM being clean, and a single missed
   surface reads as an attempt to route around IAP.
4. **Play's Data safety form contradicts the privacy policy.** B4, B7.
5. **Guideline 4.2, "this is a repackaged website."** Mitigated by the native
   layer, but only if the review notes describe capabilities the binary
   genuinely has. Every unticked line in section C that stays in the notes
   turns a defence into a false claim.
