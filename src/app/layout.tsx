import type { Metadata, Viewport } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Alpha Workspace, the workspace that does the following up",
    template: "%s · Alpha Workspace",
  },
  description:
    "Status reports itself, tasks cost nothing to create, and your team's day starts inside the product. Built for South African teams, offline-first, light on data, priced in rand.",
  openGraph: {
    siteName: "Alpha Workspace",
    type: "website",
    images: [{ url: "/brand/og.jpg", width: 1200, height: 630 }],
  },
  applicationName: "Alpha Workspace",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Alpha",
  },
};

export const viewport: Viewport = {
  themeColor: "#FBFAF2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Applies the persisted theme before paint. Light is the default. */
const themeInit = `try{if(localStorage.getItem("aw-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <link
          rel="preload"
          href="/fonts/instrument-sans-normal-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
