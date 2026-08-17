# Store assets: what exists, what each store needs, how to make the rest

Specs verified August 2026 against
<https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/>
and <https://support.google.com/googleplay/android-developer/answer/9866151>.

---

## 1. Already in this directory, ready to upload

| File | Size | Format | Where it goes |
|---|---|---|---|
| `appstore-icon-1024.png` | 1024 x 1024 | PNG, **24-bit, no alpha channel**, sRGB | App Store icon |
| `play-icon-512.png` | 512 x 512 | PNG, **32-bit with alpha**, 13 KB | Play Console > Store listing > App icon |
| `play-feature-graphic-1024x500.png` | 1024 x 500 | PNG, 24-bit, no alpha, 20 KB | Play Console > Store listing > Feature graphic |

All three are generated from `public/brand/icon-white.svg` and
`public/brand/logo-white.svg` on the ink ground `#0B1215`, using the same
recipe as `scripts/generate-icons.mjs` (white mark at 0.68 scale, centred), so
the store icons are the same artwork as the installed PWA icons in
`public/icons/`.

**The two icons are deliberately different files. Do not swap them.**
Play wants a 32-bit PNG **with** an alpha channel. Apple **rejects** an icon
containing an alpha channel or transparency. Both of the files above are already
correct for their own store; reusing one for the other store fails validation.

Apple's icon also must not have pre-rounded corners: the square artwork is
correct, and the system applies the mask.

### The App Store icon ships through the Xcode asset catalog, and the one there is currently invalid

`scripts/generate-native-assets.mjs` (`npm run icons:native`) already writes a
1024 x 1024 icon straight into
`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`, which is
the right place: modern Xcode projects deliver the App Store icon from the asset
catalog rather than through an App Store Connect upload. So
`appstore-icon-1024.png` in this directory is a reference copy, not the shipping
path.

**But the icon in the catalog has an alpha channel, and App Store Connect
rejects that on upload.** Verified on the generated file:

```
$ node --input-type=module -e '
import sharp from "sharp";
const m = await sharp("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png").metadata();
console.log(m.width + "x" + m.height, "channels=" + m.channels, "hasAlpha=" + m.hasAlpha);'
1024x1024 channels=4 hasAlpha=true
```

The cause is a subtlety in `sharp`. `generate-native-assets.mjs` does
`.flatten({ background: INK })` and comments, correctly, that the App Store
rejects an alpha channel. On a plain pipeline `flatten()` does drop the channel,
but **once the pipeline contains a `composite()`, flatten alone leaves four
channels in the PNG**:

```
composite + flatten            -> channels=4
composite + flatten + removeAlpha -> channels=3
```

**Fix, one call.** In `scripts/generate-native-assets.mjs`, in `icon()`:

```js
if (flatten) image = image.flatten({ background: INK }).removeAlpha();
```

Then re-run `npm run icons:native` and re-check. That file is owned by whoever
owns `scripts/`; this is tracked as blocker B9 in `store/PRE-FLIGHT.md`.

Until it is fixed, `store/assets/appstore-icon-1024.png` is a correct drop-in
replacement: same artwork, same recipe, `channels=3 hasAlpha=false`. Copying it
over the catalog file works, but the generator will overwrite it on the next
run, so fix the generator.

If Xcode's Icon Composer is used instead of a flat PNG, re-check the alpha
channel afterwards as well: layered icon output has been reported to trip the
same validation.

The feature graphic is a clean baseline, not a finished piece of art. Play crops
and overlays it on several surfaces, which is why the wordmark sits well inside
the frame with nothing near an edge. If it gets replaced, keep it 1024 x 500,
keep the content centred, and remember Play may render the app icon on top of
it.

---

## 2. Still to capture: the screenshots

**Nothing under `public/marketing/shots/` can be uploaded as-is.** Every
existing shot is the wrong pixel size for every store slot. What they are good
for is the framing: the subjects, the staging and the navigation are already
solved, and the same script produces store sizes with different viewports.

Existing shots, and what they map to:

| Existing file | Pixels | Store slot it fills | Why |
|---|---|---|---|
| `board-desktop-light.png` | 2880 x 1800 | **none** | 16:10 desktop. No store slot is 16:10. It is the source of the marketing hero, not a store asset. |
| `my-work-desktop-light.png` | 2880 x 1800 | **none** | same |
| `pulse-desktop-light.png` | 2880 x 1800 | **none** | same |
| `my-work-mobile-light.png` | 780 x 1688 | **none, but closest** | 390 x 844 at 2x. The aspect is nearly the iPhone 6.9" ratio (2.164 against 2.173) but not equal, and upscaling a 2x capture to 1320 wide is visibly soft. Re-shoot at 3x. |
| `weekly-briefing-card-light.png` | 1696 x 480 | **none** | An element crop, not a screen. Useful as source material if a composed screenshot with a headline is ever built. |

So: **all store screenshots have to be captured fresh.** The good news is that
this is a viewport change to a script that already exists.

### 2a. Apple, iPhone 6.9" display: the only iPhone set you need

Supply this set and every smaller iPhone size is filled by Apple scaling it
down. 6.5" is annotated "Required if app runs on iPhone and screenshots for
6.9" display aren't provided", so providing 6.9" makes 6.5" optional, and the
cascade continues down through 6.3", 6.1", 5.5" and 4.7".

- **Pixels: 1320 x 2868 portrait.** (1290 x 2796 and 1260 x 2736 are also
  accepted. Pick one and stay with it.)
- **Capture recipe: viewport 440 x 956, `deviceScaleFactor: 3`.** That is the
  iPhone 16 Pro Max logical size, so the layout is real rather than stretched.
- Count: 1 minimum, 10 maximum. **Ship 5.**
- Format: PNG or JPEG, **no alpha channel, no transparency**.
- Do not upload landscape. The app is portrait-first
  (`src/app/manifest.ts` sets `orientation: "portrait"`).

### 2b. Apple, iPad: DECIDED, iPad stays declared and the set is captured

`TARGETED_DEVICE_FAMILY` stays `"1,2"` (iPhone and iPad), by Joseph's call on
2026-08-17. The earlier draft of this section recommended dropping to iPhone
only on the grounds that nobody had tested a tablet layout. That objection has
been answered rather than avoided: `e2e/tablet.spec.ts` audits five surfaces at
iPad size and asserts no horizontal overflow, that the desktop sidebar (not the
phone tab bar) is what appears at 1032 points, and that landscape does not
strand the content in a narrow column. It passes.

**Both sets are already captured.** They are generated from the running product
by `e2e/store-shots.spec.ts`, so they cannot drift from what the app does:

```
npm run db:reset:local          # clean seed: the write journeys leave litter
npx playwright test --project=iphone --project=ipad store-shots
```

Output, ready to upload, sizes asserted by the spec itself:

| Slot | Files | Pixels |
| --- | --- | --- |
| App Store, iPhone 6.9" | `store/assets/screenshots/iphone/1-4.png` | 1320 x 2868 |
| App Store, iPad 13" | `store/assets/screenshots/ipad/1-4.png` | 2064 x 2752 |

The 12.9" iPad row is not separately required: omit it and Apple scales the 13"
set. Supplying 6.9" likewise makes the 6.5" iPhone set optional.

Three things the capture handles that a manual screenshot would get wrong:

- **No billing surface is captured.** The binaries ship commerce free under
  Apple 3.1.3(f), so a price in a screenshot contradicts the review notes.
- **Next's dev indicator is hidden** at capture time. It floats over the
  bottom-left corner, on top of the sidebar's Settings link.
- **The window is forced to 1100x1500 for iPad.** A viewport taller than the
  browser window makes Chromium tile the capture and repeat every `sticky`
  element, which put a second copy of the app header near the bottom of the
  image. It reads as a duplicated-component bug and is purely an artefact.

### 2c. Play, phone

- **Minimum to publish: 2 screenshots.** Maximum 8 per device type.
- **Ship 5**, matching the iPhone set. Play's own guidance is that at least
  four screenshots at 1080 px or more is what makes a listing eligible for the
  recommendation surfaces that use screenshots, so five costs nothing and buys
  that.
- Format: JPEG or **24-bit PNG, no alpha**.
- **Pixels: 1080 x 1920.** Capture recipe: **viewport 360 x 640,
  `deviceScaleFactor: 3`.**

  **Why not just reuse the 1320 x 2868 Apple shots.** Play's stated constraints
  are a minimum dimension of 320 px, a maximum of 3840 px, and a longer side no
  more than **twice** the shorter side. 2868 / 1320 is 2.17, which breaks the
  last one. 1920 / 1080 is 1.78, which is safe under every reading of the rule,
  and 9:16 is what Play recommends anyway.

  **Flagged as uncertain:** plenty of live Play listings carry taller-than-2:1
  screenshots, so the 2:1 cap may no longer be enforced. 1080 x 1920 sidesteps
  the question entirely, which is why it is the recommendation. If you would
  rather have the taller modern look, try 1080 x 2400 (viewport 360 x 800 at 3x)
  and let the Console tell you; it validates on upload, so a rejection there
  costs a minute rather than a review round.

  360 points wide is a real Android width and the layout handles it, but 640
  points tall is short, so plan the crop: put the thing each screenshot is about
  in the top two thirds.

### 2d. Play, tablet and Chromebook

Only if you opt into large-screen distribution. Not required to publish.

- 4 screenshots minimum, 1080 to 7680 px, 16:9 landscape or 9:16 portrait.
- 1920 x 1080 landscape from **viewport 960 x 540, `deviceScaleFactor: 2`**.
- Do not upload upscaled phone frames. Play's guidance is to show the real
  large-screen layout, and a stretched phone reads worse than no tablet
  screenshots at all.

### 2e. Play promo video

Optional. A **YouTube URL**, not an uploaded file. It must be public or
unlisted, have ads disabled, not be age-restricted, and be embeddable on Google
Play. Skip it for v1; a bad promo video costs more than no promo video. Note this
is a different asset from the foreground-service demonstration video in
`store/review-notes.md` Part 5, which is a private link for reviewers and must
never be the listing's promo video.

---

## 3. The five screenshots, in order

Same five subjects for both stores, same order, so the two listings tell one
story. Every one of these is a screen the demo workspace already shows, and the
first three are surfaces `scripts/marketing-shots.ts` already navigates to.

| # | Screen | What it has to show | Route |
|---|---|---|---|
| 1 | **My Work** | The morning brief card at the top ("Morning Lerato, 2 due today. Start there."), then today's tasks with the coloured due-date rails. This is the app's answer to "what do I do now", so it leads. | `/w/{slug}` |
| 2 | **Project board** | To do, In progress and Done with real cards, one card mid-drag if you can stage it. Gold and crimson rails visible on the leading edges. | `/w/{slug}/p/{projectId}` |
| 3 | **Pulse** | The weekly briefing paragraph up top, then the KPI tiles: completion rate, done this week, overdue, stale. The proof that status reports itself. | `/w/{slug}/dashboard` |
| 4 | **A processed meeting** | Transcript with speakers separated, the summary, and the action items with their confirm control. The most differentiated screen in the product. | `/w/{slug}/meetings/{meetingId}` |
| 5 | **Voice capture mid-proposal** | The proposal list on screen with the person, project and day already attached, and nothing created yet. It shows the extract-then-confirm rule in one frame. | quick-add sheet on `/w/{slug}` |

**Screenshots 4 and 5 do not exist in any form yet** and are the two that need
new staging: a meeting with a real transcript, and the voice-capture sheet held
open at the proposal step. Both need `DEEPGRAM_API_KEY` and
`ANTHROPIC_API_KEY` present for the local run, or hand-written fixture rows.

If microphone does not ship in v1 (see `store/review-notes.md` Part 5), **drop
4 and 5** and ship three screenshots. Play's minimum is 2; Apple's is 1. Do not
show a feature the binary does not have.

**No text overlays, no device frames, no marketing captions** for v1. The
product screens are legible on their own, the marketing page already proves
that, and an overlay is one more thing to get wrong in two aspect ratios. If
captions are added later, keep them out of the top and bottom 10 percent, where
both stores crop.

---

## 4. How to capture: the patch to the shot script

`scripts/marketing-shots.ts` already stages the seeded workspace, regenerates
the morning brief and weekly narrative through the app's own jobs, signs in with
a saved Playwright session, and shoots at `deviceScaleFactor: 2`. Store shots
are the same machinery at different viewports.

**That file is not owned by this package.** Hand the following to whoever owns
`scripts/`, or run it as a one-off copy.

### 4a. One thing that must change, or every upload will be rejected

`take()` calls `slim()` on every file (`scripts/marketing-shots.ts:344-359`),
and `slim()` **downscales the image** with `sips -Z` whenever it exceeds the
300 KB marketing budget. A 1320 x 2868 screenshot will exceed 300 KB and come
back as roughly 1056 x 2294, which is not an accepted App Store size, and App
Store Connect rejects the upload on dimensions.

**Store shots must bypass `slim()` entirely.** Either add a `slim: false`
option to `take()`, or write store shots through a separate helper. Verify the
pixel dimensions of every file before uploading:

```
cd /Users/josephmbedzi/alphaworkspace/store/assets/screenshots
for f in *.png; do echo "$f $(sips -g pixelWidth -g pixelHeight "$f" | tr -d ' \n')"; done
```

Play accepts up to 8 MB per screenshot, and Apple is not tight either, so leave
these files uncompressed rather than risk a resize.

### 4b. The viewports

| Slot | Viewport | Scale | Output |
|---|---|---|---|
| Apple iPhone 6.9" | 440 x 956 | 3 | 1320 x 2868 |
| Apple iPad 13" (only if iPad stays declared) | 1032 x 1376 | 2 | 2064 x 2752 |
| Play phone | 360 x 640 | 3 | 1080 x 1920 |
| Play large screen (optional) | 960 x 540 | 2 | 1920 x 1080 |

### 4c. The block to add

Add inside `shoot()`, after the existing `desktop` and `mobile` constants:

```ts
// Store screenshots. Exact pixel sizes are mandatory: App Store Connect
// validates dimensions on upload, so these must NOT go through slim(),
// which downscales anything over the 300KB marketing budget.
const ios69 = { width: 440, height: 956 };   // x3 -> 1320x2868
const playPhone = { width: 360, height: 640 }; // x3 -> 1080x1920

for (const [name, viewport, scale] of [
  ["ios69", ios69, 3],
  ["play", playPhone, 3],
] as const) {
  await takeStore(`store-${name}-1-my-work.png`, viewport, scale, async (page) => {
    await page.goto(`/w/${ids.slug}`);
    await page.getByRole("heading", { name: "My Work" }).waitFor();
    await settle(1800, page);
  });
  await takeStore(`store-${name}-2-board.png`, viewport, scale, async (page) => {
    await page.goto(`/w/${ids.slug}/p/${ids.projects.rebrand}`);
    await page.getByRole("region", { name: "To do" }).waitFor();
    await settle(1800, page);
  });
  await takeStore(`store-${name}-3-pulse.png`, viewport, scale, async (page) => {
    await page.goto(`/w/${ids.slug}/dashboard`);
    await page.getByRole("heading", { name: "Pulse" }).waitFor();
    await settle(2400, page);
  });
  // 4 (meeting) and 5 (voice capture proposals) need staging that does not
  // exist yet. See section 3.
}
```

`takeStore` is `take()` with `deviceScaleFactor` taken from the argument, no
`slim()` call, and output into `store/assets/screenshots/`.

### 4d. Running it

Exactly as the existing script is run, with the local database and dev server:

```
npm run db:reset:local                 # optional, gives clean staged data
npm run dev:local -- --port 3100       # in another terminal
npx tsx scripts/with-local-env.ts \
  npx tsx --tsconfig tsconfig.scripts.json scripts/marketing-shots.ts
```

It refuses to run against anything but a localhost database, twice
(`scripts/with-local-env.ts` and the script's own re-assertion), so the
screenshots can only ever contain seeded demo data. That matters: **store
screenshots must never show a real customer's workspace.** The seeded workspace
is Mzansi Studio with Lerato, Thabo, Naledi and Sipho, all fictional, which is
recorded in `public/marketing/shots/manifest.json` as
"seeded local demo data, no real customers".

One thing to check before shooting: the seed puts the workspace on the `studio`
band so every surface is visible. Keep it there, or a screenshot will show a
free-band empty state.

---

## 5. Where each asset goes, at upload time

**App Store Connect** > your app > the version:
- App Store icon: through the Xcode asset catalog in `ios/`, not uploaded here.
- Screenshots: Media Manager, the **iPhone 6.9" Display** slot (and **iPad 13"**
  if iPad stays declared).

**Play Console** > Grow users > Store presence > **Store listing**:
- App icon: `play-icon-512.png`
- Feature graphic: `play-feature-graphic-1024x500.png`
- Phone screenshots: the `store-play-*.png` set
- Tablet and Chromebook screenshots: only if you opted into large screens

---

## 6. Regenerating the icons and the feature graphic

The three files in section 1 were generated with `sharp`, which is already a dev
dependency. If the brand assets change, run this from the repository root:

```
node --input-type=module -e '
import sharp from "sharp";
const INK = "#0B1215";
const badge = async (size, out, alpha, scale = 0.68) => {
  const mark = await sharp("public/brand/icon-white.svg", { density: 600 })
    .resize(Math.round(size * scale), Math.round(size * scale)).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: INK } })
    .composite([{ input: mark, gravity: "center" }]);
  if (!alpha) img = img.flatten({ background: INK }).removeAlpha();
  await img.png({ compressionLevel: 9 }).toFile(out);
};
await badge(1024, "store/assets/appstore-icon-1024.png", false);
await badge(512, "store/assets/play-icon-512.png", true);
const markW = 560, markH = Math.round((560 * 208.641) / 1605.236);
const mark = await sharp("public/brand/logo-white.svg", { density: 600 })
  .resize(markW, markH).png().toBuffer();
await sharp({ create: { width: 1024, height: 500, channels: 4, background: INK } })
  .composite([{ input: mark, gravity: "center" }])
  .flatten({ background: INK }).removeAlpha()
  .png({ compressionLevel: 9 }).toFile("store/assets/play-feature-graphic-1024x500.png");
'
```

`.removeAlpha()` is the load-bearing call: `.flatten()` alone composites onto the
background but leaves a fourth channel in the PNG, and Apple rejects that.
Verify afterwards:

```
node --input-type=module -e '
import sharp from "sharp";
for (const f of ["store/assets/appstore-icon-1024.png","store/assets/play-icon-512.png","store/assets/play-feature-graphic-1024x500.png"]) {
  const m = await sharp(f).metadata();
  console.log(f, `${m.width}x${m.height}`, "channels="+m.channels, "hasAlpha="+m.hasAlpha);
}
'
```

Expected: the App Store icon and the feature graphic at `channels=3
hasAlpha=false`, the Play icon at `channels=4 hasAlpha=true`.
