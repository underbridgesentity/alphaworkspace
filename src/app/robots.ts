import type { MetadataRoute } from "next";

const base = () =>
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.alphaworkspace.co.za").replace(
    /\/$/,
    "",
  );

/** Marketing pages are indexable; everything behind sign-in is not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/w/", "/account", "/admin", "/api/", "/onboarding", "/invite/"],
    },
    sitemap: `${base()}/sitemap.xml`,
    host: base(),
  };
}
