/**
 * Generates the Capacitor shell's launcher icons and splash screens from the
 * brand source assets. Run: node scripts/generate-native-assets.mjs
 * Outputs are committed; re-run only when brand assets change.
 *
 * The native counterpart to scripts/generate-icons.mjs, and deliberately the
 * same recipe: an ink badge carrying the white Alpha mark, so the icon on a
 * home screen is the same icon whether the user installed the PWA or the store
 * app. What ships otherwise is Capacitor's placeholder logo, which is an
 * instant store rejection and an obvious "this is a template" tell.
 *
 * Sizes are read from the files Capacitor already scaffolded rather than being
 * listed here, so a future `cap sync` that adds a density does not silently
 * leave one unbranded.
 */
import sharp from "sharp";
import { readdir, stat } from "node:fs/promises";

const INK = "#0b1215"; // --ink, matches the PWA icon badge
const CANVAS = "#fbfaf2"; // --bg, matches every backgroundColor in the config

const ANDROID_RES = "android/app/src/main/res";
const IOS_ASSETS = "ios/App/App/Assets.xcassets";

/** The wordmark centred on the brand canvas, at `scale` of the short edge. */
async function splash(width, height, out, scale = 0.42) {
  const markWidth = Math.round(Math.min(width, height) * scale);
  const mark = await sharp("public/brand/logo-black.svg", { density: 300 })
    .resize({ width: markWidth })
    .png()
    .toBuffer();
  await sharp({
    create: { width, height, channels: 4, background: CANVAS },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log("wrote", out, `${width}x${height}`);
}

/** Ink badge with the white mark centred, optionally circular. */
async function icon(size, out, { scale = 0.68, round = false, flatten = false } = {}) {
  const markSize = Math.round(size * scale);
  const mark = await sharp("public/brand/icon-white.svg", { density: 300 })
    .resize(markSize, markSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  let image = sharp({
    create: { width: size, height: size, channels: 4, background: INK },
  }).composite([{ input: mark, gravity: "center" }]);

  if (round) {
    const circle = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
    );
    image = sharp(await image.png().toBuffer()).composite([
      { input: circle, blend: "dest-in" },
    ]);
  }

  // The App Store rejects an icon with an alpha channel outright.
  if (flatten) image = image.flatten({ background: INK });

  await image.png({ compressionLevel: 9 }).toFile(out);
  console.log("wrote", out, `${size}x${size}`);
}

/**
 * The adaptive-icon foreground. The mark is small because Android crops this
 * canvas to a mask of its own choosing and only the inner ~66% is guaranteed
 * to survive; the ink comes from ic_launcher_background instead.
 */
async function adaptiveForeground(size, out) {
  const markSize = Math.round(size * 0.45);
  const mark = await sharp("public/brand/icon-white.svg", { density: 300 })
    .resize(markSize, markSize)
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log("wrote", out, `${size}x${size}`);
}

async function dimensions(file) {
  const { width, height } = await sharp(file).metadata();
  return { width, height };
}

/* ------------------------------- android -------------------------------- */

const dirs = await readdir(ANDROID_RES);

for (const dir of dirs) {
  const path = `${ANDROID_RES}/${dir}`;
  if (!(await stat(path)).isDirectory()) continue;

  if (dir === "drawable" || dir.startsWith("drawable-port-") || dir.startsWith("drawable-land-")) {
    const file = `${path}/splash.png`;
    try {
      const { width, height } = await dimensions(file);
      // Landscape gets a smaller mark: 42% of the short edge would run the
      // wordmark off both sides of a wide canvas.
      await splash(width, height, file, width > height ? 0.3 : 0.42);
    } catch {
      // No splash at this density; nothing to rebrand.
    }
    continue;
  }

  if (dir.startsWith("mipmap-") && dir !== "mipmap-anydpi-v26") {
    const launcher = `${path}/ic_launcher.png`;
    const { width } = await dimensions(launcher);
    await icon(width, launcher);
    await icon(width, `${path}/ic_launcher_round.png`, { round: true });
    try {
      const fg = `${path}/ic_launcher_foreground.png`;
      const { width: fgWidth } = await dimensions(fg);
      await adaptiveForeground(fgWidth, fg);
    } catch {
      // Density without an adaptive foreground.
    }
  }
}

/* --------------------------------- ios ---------------------------------- */

await icon(1024, `${IOS_ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`, {
  flatten: true,
});

for (const name of await readdir(`${IOS_ASSETS}/Splash.imageset`)) {
  if (!name.endsWith(".png")) continue;
  const file = `${IOS_ASSETS}/Splash.imageset/${name}`;
  const { width, height } = await dimensions(file);
  // The iOS splash is a single square scaled to fill, so the mark has to be
  // small enough to survive the crop to a phone's aspect ratio.
  await splash(width, height, file, 0.24);
}
