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
    // Both stores check these two by hand: Apple wants a working Support URL
    // on the listing, Play wants the account-deletion URL reachable without
    // signing in. Keep them public and keep them here.
    { url: `${b}/support`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${b}/delete-account`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${b}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${b}/sign-in`, changeFrequency: "yearly", priority: 0.5 },
  ];
}
