import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell for the App Store and Google Play.
 *
 * WHY server.url AND NOT A BUNDLED BUILD: every screen under /w/ is a React
 * Server Component, all data goes through the DAL behind withWorkspace(), and
 * auth is Auth.js with server-set session cookies. `output: "export"` cannot
 * produce any of that, so bundling would mean forking the product into a
 * client SPA against a JSON API and solving cross-origin cookies. Pointing the
 * webview at the live origin instead means the CSP, the Auth.js cookies, the
 * Supabase signed-URL uploads and the offline outbox all keep working exactly
 * as they do in a browser, and a web deploy ships to the apps at the same time.
 *
 * The cost is Apple guideline 4.2 scrutiny, which the native capability layer
 * (share target, biometric lock, push, background recording) exists to clear.
 *
 * appendUserAgent is the load-bearing line for the stores: the server reads
 * this marker (src/lib/shell.ts) and strips every price, upgrade link and
 * checkout surface before the DOM exists. Apple 3.1.3(f) gives a 0% commission
 * only if the binary contains no purchasing; Play's ZA storefront requires
 * Play Billing for any in-app purchase surface. Changing this string without
 * changing shellPlatform() would silently expose commerce inside the apps.
 */
const config: CapacitorConfig = {
  appId: "za.co.alphaworkspace.app",
  appName: "Alpha Workspace",
  // Unused for navigation (server.url wins) but Capacitor requires it to
  // exist, and it holds the offline fallback the shell shows when the origin
  // is unreachable before the service worker has ever run.
  webDir: "native/public",
  server: {
    url: "https://www.alphaworkspace.co.za/app",
    hostname: "www.alphaworkspace.co.za",
    androidScheme: "https",
    iosScheme: "https",
    /*
     * REQUIRED, and the app is unusable without it. Capacitor iOS decides
     * "is this navigation ours" by STRING-PREFIXING the full server.url,
     * path included. With url ending in /app, the very first server redirect
     * (/app -> /sign-in) fails that prefix test, the main-frame load is
     * cancelled (WebKit code 102) and the URL is handed to Safari: blank
     * webview, sign-in opens in the system browser, and cookies set there
     * never reach the app, so nobody can ever sign in. allowNavigation is
     * checked BEFORE the prefix rule and matches by host, which is the
     * semantic actually wanted. Found by running the app in the simulator;
     * no build error catches this. Off-host links still open externally via
     * the runtime's click handler, and WKAppBoundDomains still fences the
     * webview to these hosts.
     */
    allowNavigation: ["www.alphaworkspace.co.za"],
    // No cleartext anywhere: the session cookie must never cross plain HTTP.
    cleartext: false,
  },
  ios: {
    // Cookies survive app restarts, so a signed-in user stays signed in.
    limitsNavigationsToAppBoundDomains: true,
    appendUserAgent: "AlphaShell/1 (ios)",
    // "never", not "always", so there is exactly ONE mechanism deciding where
    // the status bar ends: the CSS env(safe-area-inset-*) the app already uses
    // for the tab bar. "always" adds a UIScrollView content inset on top of
    // that, which double-insets the header and is not observable from any
    // build we can run here. This also makes the shell render identically to
    // the installed PWA, which is on viewport-fit=cover and black-translucent
    // and therefore already draws under the status bar.
    contentInset: "never",
    backgroundColor: "#fbfaf2",
  },
  android: {
    appendUserAgent: "AlphaShell/1 (android)",
    backgroundColor: "#fbfaf2",
    // Play requires HTTPS-only traffic for a shell like this; the default is
    // already false, set explicitly so a future edit has to be deliberate.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // launchAutoHide stays ON with a generous duration, and the web layer
      // ALSO calls hide() the moment React mounts (src/components/native/
      // runtime.tsx). Belt and braces, because the webview points at a remote
      // origin: on the patchy connectivity this product is built for, the page
      // may never run any JS, and a splash only JS can dismiss is a hung app.
      launchAutoHide: true,
      launchShowDuration: 2000,
      launchFadeOutDuration: 200,
      backgroundColor: "#fbfaf2",
      showSpinner: false,
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      // The runtime re-applies both of these on every theme change; these are
      // the values for the first frame, before any JS has run.
      style: "LIGHT",
      backgroundColor: "#fbfaf2",
      overlaysWebView: false,
    },
  },
};

export default config;
