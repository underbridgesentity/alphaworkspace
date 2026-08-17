# Store submission runbook

Alpha Workspace, App Store and Google Play. `za.co.alphaworkspace.app`.

This is meant to be followed in order, at night, without thinking. Two kinds of
step: **[JOSEPH]** is something only you can do, usually in a browser or a
console. **[DONE]** is already in the repository and just needs pointing at.

**Start here, not at step 1.** Open `store/PRE-FLIGHT.md` and read section B.
There are five open blockers in the product, two of which will get you rejected
on the first pass. If B1 is not fixed you cannot submit to Apple at all, because
there is no support page for the required Support URL.

---

## What is in this directory

```
store/
  README.md                       this file
  PRE-FLIGHT.md                   the go/no-go checklist. Read section B first.
  review-notes.md                 paste blocks for both reviewers, plus the
                                  demo-account steps and the Android microphone
                                  decision
  listing/
    README.md                     which file goes in which field, with counts
    google-play-title.txt                     15 chars of 30
    google-play-short-description.txt         72 of 80
    google-play-full-description.txt        3271 of 4000
    google-play-contact-and-metadata.txt      category, contact, URLs
    apple-name.txt                            15 of 30
    apple-subtitle.txt                        24 of 30
    apple-promotional-text.txt               151 of 170
    apple-description.txt                   3204 of 4000
    apple-keywords.txt                        96 of 100
    apple-urls-and-contact.txt                support/marketing/privacy URLs,
                                              copyright, categories, age rating
  privacy/
    data-safety.md                Google Play Data Safety, answer by answer
    apple-privacy-labels.md       App Store nutrition labels, answer by answer
    CONTRADICTIONS.md             where the live privacy page disagrees with the
                                  code. Read before filling either form.
  assets/
    README.md                     icon and screenshot specs, capture recipes
    appstore-icon-1024.png        1024x1024, no alpha        ready to upload
    play-icon-512.png             512x512, with alpha        ready to upload
    play-feature-graphic-1024x500.png                        ready to upload

public/.well-known/
  assetlinks.json                 Digital Asset Links, with a placeholder
                                  fingerprint. See step A7.
```

Screenshots are **not** in here yet. They have to be captured; see step 3.

---

## Phase 0. Decisions to make before anything else

### 0.1 [JOSEPH] Register the Play developer account as an **Organisation**

Not personal. This is the single highest-leverage decision in the whole process.

Play's testing requirement, a closed test with **at least 12 testers opted in
continuously for 14 days** before you may even apply for production access,
applies only to **personal accounts created after 13 November 2023**.
Organisation accounts skip it entirely.

The cost is a D-U-N-S number, which takes days to weeks to get if you do not
already have one. The alternative cost is recruiting a dozen real people with
real Android devices and then waiting two weeks and a human review.

Reference: <https://support.google.com/googleplay/android-developer/answer/14151465>

### 0.2 [JOSEPH] Decide whether the microphone ships in v1

This changes the listings, the review notes, and whether you need to make a
demonstration video. Three options, spelled out in `store/review-notes.md`
Part 5:

- **Shape A**, no microphone. Cheapest. Delete the voice-capture and meeting
  paragraphs from both descriptions, and hide those surfaces in shell mode.
- **Shape B**, microphone, recording only while the app is on screen. Needs
  `RECORD_AUDIO` in the Android manifest and `NSMicrophoneUsageDescription` in
  `Info.plist`. **No Play declaration and no video.**
- **Shape C**, microphone plus background recording. Needs a foreground service,
  plus a Play Console declaration **with a demonstration video**.

As of writing neither native project permits the microphone at all, so doing
nothing means Shape A.

### 0.3 [JOSEPH] Decide iPhone-only or iPhone and iPad

`ios/App/App.xcodeproj/project.pbxproj` currently has
`TARGETED_DEVICE_FAMILY = "1,2"`, which declares iPad. That makes 13" iPad
screenshots mandatory and puts an untested layout in front of a reviewer.
Recommend setting it to `"1"` for v1. `store/assets/README.md` section 2b has
both paths.

---

## Phase 1. Accounts, keys, identifiers

1. **[JOSEPH]** Apple Developer Program, paid and active. Individual or
   Organisation: the choice shows on the store as the seller name and cannot be
   changed later without a new account.
2. **[JOSEPH]** Google Play developer account, per 0.1.
3. **[JOSEPH]** Register the identifier on both, as
   **`za.co.alphaworkspace.app`**. It matches `capacitor.config.ts:26` and
   `android/app/build.gradle:7` and **cannot be changed after the first
   release**.
4. **[JOSEPH]** Enrol in **Play App Signing**. Back up the upload keystore and
   its passwords.
5. **[JOSEPH]** iOS Distribution certificate and App Store provisioning
   profile. Xcode automatic signing does this once the account is live.
6. **[JOSEPH]** Only if push ships: APNs authentication key (the `.p8`
   downloads **once**, save it) and `google-services.json` into `android/app/`.
   `PRE-FLIGHT.md` A4 and A5.

---

## Phase 2. Fix the blockers

Work through **`store/PRE-FLIGHT.md` section B**. Nothing else in this runbook
is worth doing until B1 and B2 are done, because they are hard store gates with
nothing to point at today.

- **B1** there is no support page and no published support address. Apple's
  Support URL is required, Play's contact email is required. **P0, both stores.**
- **B2** the account-deletion URL is behind the sign-in wall. Play requires a
  reachable web page. **P0, Play.**
- **B3** in-app account deletion can fail on a foreign key. Apple tests this.
  **P0, Apple.**
- **B4** the privacy page contradicts the code in nine places. See
  `store/privacy/CONTRADICTIONS.md`. **P1, both.**
- **B5** the microphone is not permitted in either native shell. **P0 if the
  listing claims it.**

---

## Phase 3. Build the assets

### 3.1 [DONE] Icons and the feature graphic

Already generated, correct format for each store, in `store/assets/`:

| File | Goes to |
|---|---|
| `store/assets/appstore-icon-1024.png` | reference copy. The shipping path is the Xcode asset catalog, written by `npm run icons:native`. See the warning below. |
| `store/assets/play-icon-512.png` | Play Console > Store listing > App icon |
| `store/assets/play-feature-graphic-1024x500.png` | Play Console > Store listing > Feature graphic |

**The two icons are different files on purpose.** Play wants alpha, Apple
rejects it. Do not swap them.

**One blocker here, and it is a one-line fix.** `npm run icons:native` writes the
App Store icon into
`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`, and the file
it writes **has an alpha channel**, which App Store Connect rejects on upload.
The cause is a `sharp` subtlety: `flatten()` does not drop the channel once the
pipeline contains a `composite()`. Fix and verification command are in
`PRE-FLIGHT.md` blocker B9 and `store/assets/README.md` section 1.

### 3.2 [JOSEPH] Screenshots

Nothing under `public/marketing/shots/` is uploadable: every existing shot is the
wrong pixel size for every slot. The subjects and the staging are solved though,
so this is a viewport change to `scripts/marketing-shots.ts`.

Read **`store/assets/README.md` sections 2, 3 and 4**. The short version:

- five iPhone shots at **1320 x 2868** (viewport 440 x 956 at scale 3)
- five Play phone shots at **1080 x 1920** (viewport 360 x 640 at scale 3)
- subjects in order: My Work, project board, Pulse, a processed meeting, voice
  capture mid-proposal
- **the capture must bypass `slim()`**, which downscales anything over 300 KB
  and would hand you an invalid size that App Store Connect rejects on upload

Then verify every file's dimensions before uploading:

```
cd /Users/josephmbedzi/alphaworkspace/store/assets/screenshots
for f in *.png; do echo "$f $(sips -g pixelWidth -g pixelHeight "$f" | tr -d ' \n')"; done
```

---

## Phase 4. The demo account

**[JOSEPH]** Full steps in `store/review-notes.md` Part 1. In outline:

1. A real mailbox you control, for example `appreview@alphaworkspace.co.za`.
2. Sign in on the **web** with a magic link. Create the workspace at
   `/onboarding` (call it `App Review Studio`).
3. **Set a password** at Account > Password, leaving "Current password" empty.
   A reviewer cannot read your mailbox, so this step is not optional.
4. Comp it to **Studio** at `https://www.alphaworkspace.co.za/admin`, signed in
   as **your own** operator account. Find the workspace in the table, change the
   Plan dropdown. That comps directly with no PayFast charge.
5. Seed it: three projects with client names, a dozen or so tasks including one
   overdue and one due today, a few comments, a few private tasks, and **one
   processed meeting**.
6. Leave the **Bots** toggle off.
7. Keep the workspace **single-member**, so account deletion is one clean path.
8. **Never let it expire.** Apple returns to the same credentials on every
   update.

---

## Phase 5. Apple submission, click by click

1. **[JOSEPH]** App Store Connect > **Apps** > **+** > **New App**. Platform
   iOS, Name `Alpha Workspace`, Primary Language English (UK) or English (US),
   Bundle ID `za.co.alphaworkspace.app`, SKU `alpha-workspace-ios`.
2. **[JOSEPH]** **App Information**:
   - Subtitle: `store/listing/apple-subtitle.txt`
   - Privacy Policy URL, categories and copyright:
     `store/listing/apple-urls-and-contact.txt`
   - Category **Productivity**, secondary **Business**
3. **[JOSEPH]** **Age Rating**: answer every question "None". When asked about
   user-generated content, answer **yes**, and note that it is private to an
   invited team rather than a public feed. Expect 4+. Guidance in
   `apple-urls-and-contact.txt`.
4. **[JOSEPH]** **App Privacy**: work through
   **`store/privacy/apple-privacy-labels.md`** field by field. Read its section 0
   first: Apple's model is not Google's, there is no "shared" question, and your
   vendors' collection counts as yours. **This is a submission gate.**
5. **[JOSEPH]** The version page:
   - Promotional Text: `store/listing/apple-promotional-text.txt`
   - Description: `store/listing/apple-description.txt`
   - Keywords: `store/listing/apple-keywords.txt`
   - Support URL and Marketing URL: `apple-urls-and-contact.txt`
   - Screenshots: the iPhone **6.9" Display** slot, five files
6. **[JOSEPH]** Upload the build (Xcode > Product > Archive > Distribute, or
   `xcrun altool`). Wait for processing, then **select the build on the version
   page**. A processed build is not attached until you attach it.
7. **[JOSEPH]** **App Review Information**:
   - Sign-In Required: **yes**, with the demo email and password from Phase 4
   - Notes: the paste block in **`store/review-notes.md` Part 3**. Fill in the
     contact line. **Delete any capability paragraph you could not tick in
     Part 2.**
8. **[JOSEPH]** Export compliance: HTTPS only, no proprietary cryptography.
   Answer the questions rather than guessing.
9. **[JOSEPH]** Run through `PRE-FLIGHT.md` section C against the actual build,
   then section D. Then **Add for Review**.

---

## Phase 6. Play submission, click by click

1. **[JOSEPH]** Play Console > **Create app**. Name `Alpha Workspace`, English
   (South Africa) or English (UK), an **App**, **Free**, accept the
   declarations.
2. **[JOSEPH]** **Store listing** (Grow users > Store presence):
   - App name: `store/listing/google-play-title.txt`
   - Short description: `store/listing/google-play-short-description.txt`
   - Full description: `store/listing/google-play-full-description.txt`
   - App icon: `store/assets/play-icon-512.png`
   - Feature graphic: `store/assets/play-feature-graphic-1024x500.png`
   - Phone screenshots: the five 1080 x 1920 files
   - Category, tags, contact details:
     `store/listing/google-play-contact-and-metadata.txt`
3. **[JOSEPH]** **App content**, one card at a time:
   - **Privacy policy**: `https://www.alphaworkspace.co.za/privacy`
   - **App access**: restricted, with the credentials and the instruction block
     from **`store/review-notes.md` Part 4**
   - **Ads**: **No**
   - **Content rating**: complete the questionnaire
   - **Target audience**: **18 and over only**. Do not tick the Families policy.
   - **Data safety**: work through **`store/privacy/data-safety.md`** answer by
     answer. Read its section 0 first and clear the vendor checklist, because it
     decides every "shared" answer. Include the **data deletion URL**
     (blocker B2). **This is a submission gate.**
   - **Government apps**: No. **Financial features**: none. **News**: No.
   - **Foreground service permissions**: only if you shipped Shape C from
     decision 0.2. Then the declaration plus the video, per
     `store/review-notes.md` Part 5.
4. **[JOSEPH]** Upload the AAB. **Production** > **Create new release**, or a
   closed test first if you are on a personal account (decision 0.1).
5. **[JOSEPH]** Countries: **South Africa** to start. Widen later.
6. **[JOSEPH]** `PRE-FLIGHT.md` section C, then section D, then **Send for
   review**.

---

## Phase 7. After the first Play upload: the real assetlinks fingerprint

*This is the step the placeholder inside `assetlinks.json` points at, and it is
also `PRE-FLIGHT.md` item A7. Same instructions in both places.*

**[DONE]** `public/.well-known/assetlinks.json` exists, with the correct JSON
shape and an obvious placeholder where the fingerprint goes:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "za.co.alphaworkspace.app",
      "sha256_cert_fingerprints": [
        "REPLACE_WITH_SHA256_FROM_PLAY_CONSOLE_APP_SIGNING_SEE_store_README_STEP_A7"
      ]
    }
  }
]
```

**[JOSEPH]** The real fingerprint does not exist until Google has signed your
first upload, because Play App Signing re-signs the app with a key Google holds.

**Where to find it, exactly:**

> Play Console > select **Alpha Workspace** > **Test and release** > **Setup** >
> **App integrity** > the **App signing** tab > under **App signing key
> certificate**, the **SHA-256 certificate fingerprint**.

Copy it with the colons, as uppercase hex, 32 pairs. It looks like
`14:6D:E9:83:...:44:E5`.

**Then:**

1. Replace the placeholder string in
   `public/.well-known/assetlinks.json` with the fingerprint.
2. Optionally add the **upload key** fingerprint as a second array entry, from
   the same page, so locally-signed builds verify too.
3. **Redeploy the site.** The file is served from `public/`, so it ships with the
   ordinary web deploy. It is not part of the app binary, and nothing happens
   until the deploy lands.
4. Verify:
   ```
   curl -sI https://www.alphaworkspace.co.za/.well-known/assetlinks.json
   curl -s  https://www.alphaworkspace.co.za/.well-known/assetlinks.json
   ```
   Expect **200**, `content-type: application/json`, and **no 301 or 302**.
   Android refuses to follow redirects for this file.

**Why this is not urgent, which is worth knowing so it does not become a
mystery.** Digital Asset Links verification only applies to `http` or `https`
intent filters marked `android:autoVerify="true"`. The Android manifest
currently has **no https intent filter at all**: deep links use the custom
scheme `alphaworkspace://`
(`android/app/src/main/AndroidManifest.xml:57-62`). So the file verifies nothing
today. Ship it anyway. It has to be in place before an App Link is added, Google
caches asset-link lookups so a late deploy takes time to propagate, and an empty
`/.well-known/` is exactly the sort of thing that gets forgotten for a year.

**If an https App Link is ever added**, two cautions. Serve the file from every
hostname named in the intent filters, and remember an apex-to-`www` redirect
breaks the apex. And think about scope: `handle_all_urls` would route
`alphaworkspace.co.za/pricing` into the app, where the shell redirects
`/pricing` to `/app` (`src/proxy.ts:16-23`), so a pricing link emailed to a
prospect would dead-end inside the app. Scope the filter to the paths you
actually want opened.

Reference: <https://developer.android.com/training/app-links/configure-assetlinks>

---

## The one thing that can break every installed app at once

Both binaries load `https://www.alphaworkspace.co.za/app` in a webview
(`capacitor.config.ts:33`). There is no bundled build, so **a web deploy is an
app release** for every installed user, immediately, with no store review and no
app-side rollback.

Two consequences worth internalising:

1. `npm run build` staying green and `npm test` passing are release gates for
   the mobile apps, not just for the website.
2. The commerce and login gates key off the user-agent marker
   `AlphaShell/1 (ios)` / `AlphaShell/1 (android)`
   (`capacitor.config.ts:43,48`) matched by `shellPlatform()`
   (`src/lib/shell.ts:23`). **Change one without the other and the shipped store
   apps silently regain prices and a Google sign-in button**, which is an Apple
   3.1.3(f) violation and a 4.8 violation in a single edit, live, in binaries
   you cannot recall. `tests/` covers `shellPlatform`; keep it that way.

---

## Reference: the rules this package is built on

Verified August 2026. Where a rule looked like it may have moved recently, the
document that relies on it says so.

- Apple App Review Guidelines, 3.1.3(f) free stand-alone apps, 4.2 minimum
  functionality, 4.8 login services, 5.1.1(v) account deletion:
  <https://developer.apple.com/app-store/review/guidelines/>
- Apple App Privacy details:
  <https://developer.apple.com/app-store/app-privacy-details/>
- Apple screenshot specifications:
  <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/>
- Apple account deletion:
  <https://developer.apple.com/support/offering-account-deletion-in-your-app/>
- Play Data safety:
  <https://support.google.com/googleplay/android-developer/answer/10787469>
- Play account deletion:
  <https://support.google.com/googleplay/android-developer/answer/13327111>
- Play preview assets:
  <https://support.google.com/googleplay/android-developer/answer/9866151>
- Play foreground service permissions:
  <https://support.google.com/googleplay/android-developer/answer/13392821>
- Play testing requirements for new personal accounts:
  <https://support.google.com/googleplay/android-developer/answer/14151465>
- Android Digital Asset Links:
  <https://developer.android.com/training/app-links/configure-assetlinks>
