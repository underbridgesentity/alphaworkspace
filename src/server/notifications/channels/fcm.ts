import "server-only";
import { createSign } from "node:crypto";

/**
 * Firebase Cloud Messaging (HTTP v1), the transport for the store shell's
 * push. Android talks to FCM directly; iOS reaches APNs through FCM, which is
 * the standard Capacitor iOS setup and keeps one sender here instead of two.
 *
 * Configured exactly like web push is: absent credentials mean the channel
 * reports "not configured" and everything else carries on. There is no
 * fallback and no retry loop, because a notification is a nudge, and the
 * in-app record is the source of truth either way.
 *
 * Credentials come from a Firebase service account JSON:
 *   FCM_PROJECT_ID    project_id
 *   FCM_CLIENT_EMAIL  client_email
 *   FCM_PRIVATE_KEY   private_key (PEM; \n escapes are unescaped below)
 */

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface Credentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function credentials(): Credentials | null {
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const raw = process.env.FCM_PRIVATE_KEY;
  if (!projectId || !clientEmail || !raw) return null;
  // Env vars cannot hold real newlines in most deploy UIs, so the PEM arrives
  // with literal \n. Unescaping here means the operator pastes the JSON field
  // verbatim and it works.
  return { projectId, clientEmail, privateKey: raw.replace(/\\n/g, "\n") };
}

export function fcmConfigured(): boolean {
  return credentials() !== null;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * The signed assertion Google exchanges for an access token. Exported for the
 * unit test: the claim set is the part that silently breaks (wrong scope,
 * wrong audience, clock skew) and it is checkable without a network call.
 */
export function buildAssertion(
  creds: Credentials,
  nowSeconds: number,
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: creds.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(creds.privateKey));
  return `${header}.${claims}.${signature}`;
}

/** Cached access token. Google's are valid an hour; refreshed a minute early. */
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(creds: Credentials): Promise<string | null> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.token;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildAssertion(creds, Math.floor(now / 1000)),
    }),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) return null;

  cached = {
    token: body.access_token,
    expiresAt: now + ((body.expires_in ?? 3600) - 60) * 1000,
  };
  return cached.token;
}

export type FcmOutcome = "sent" | "unregistered" | "failed" | "not-configured";

export interface FcmMessage {
  title: string;
  body: string;
  /** App-relative deep link the tap handler navigates to. */
  url: string;
  type: string;
}

/**
 * Deliver one message to one device token.
 *
 * Both a `notification` block and a `data` block are sent, and that is not
 * redundant: `notification` is what the OS draws while the app is backgrounded
 * (the only time it matters), and `data` is what the tap handler reads to find
 * the deep link. Sending only one of them loses either the banner or the link.
 *
 * "unregistered" is the caller's cue to delete the row, the native equivalent
 * of web push answering 404/410 for a dead subscription.
 */
export async function sendFcm(
  token: string,
  message: FcmMessage,
): Promise<FcmOutcome> {
  const creds = credentials();
  if (!creds) return "not-configured";

  const bearer = await accessToken(creds);
  if (!bearer) return "failed";

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          // FCM data values must be strings; anything else is rejected whole.
          data: { url: message.url, type: message.type },
          android: { priority: "normal" },
          apns: {
            headers: { "apns-priority": "5" },
            payload: { aps: { sound: "default" } },
          },
        },
      }),
    },
  );

  if (res.ok) return "sent";

  // A stale cached access token would 401 forever otherwise.
  if (res.status === 401) cached = null;

  // Pruning is destructive, so it happens only on the two statuses that mean
  // THIS TOKEN is dead: 404 UNREGISTERED (app uninstalled or token rotated)
  // and 403 SENDER_ID_MISMATCH (token belongs to another Firebase project).
  //
  // 400 INVALID_ARGUMENT is deliberately NOT in that set. FCM returns it for
  // any malformed request at all, an oversized payload or a non-string data
  // value included, so treating it as a dead token would let one bad message
  // silently deregister every recipient's phone at once, staying dead until
  // each of them next launched the app.
  if (res.status === 404 || res.status === 403) return "unregistered";
  return "failed";
}
