import type { MetadataRoute } from "next";

const base = () =>
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.alphaworkspace.co.za").replace(
    /\/$/,
    "",
  );

/** The public surface only; authed routes are disallowed in robots. */
export default function sitemap(): MetadataRoute.Sitemap {
  const b = base();
  return [
    { url: `${b}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${b}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${b}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${b}/sign-in`, changeFrequency: "yearly", priority: 0.5 },
  ];
}
