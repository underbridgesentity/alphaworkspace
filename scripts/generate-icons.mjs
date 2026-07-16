/**
 * Generates PWA/app icons and the OG image from the brand source assets.
 * Run: node scripts/generate-icons.mjs
 * Outputs are committed; re-run only when brand assets change.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const INK = "#121110";

/** Ink badge with the white Alpha mark centred inside the maskable safe zone. */
async function badge(size, out, scale = 0.68) {
  const markSize = Math.round(size * scale);
  const mark = await sharp("public/brand/icon-white.svg", { density: 300 })
    .resize(markSize, markSize)
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: INK },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log("wrote", out);
}

await mkdir("public/icons", { recursive: true });
await badge(512, "public/icons/icon-512.png");
await badge(192, "public/icons/icon-192.png");
await badge(180, "src/app/apple-icon.png", 0.72);

await sharp("brand-src/social-src.png")
  .resize(1200, 630, { fit: "cover" })
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile("public/brand/og.jpg");
console.log("wrote public/brand/og.jpg");
