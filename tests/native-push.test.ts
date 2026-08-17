import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nativePushDeleteSchema, nativePushSchema } from "@/lib/validators";

/**
 * Native push (the store shell's transport) has two verifiable boundaries
 * without a device or a Firebase project: what the endpoint will accept as a
 * device token, and the assertion we sign to get an access token.
 *
 * The assertion is worth pinning because every way it fails is silent. A wrong
 * `aud`, a wrong scope or a clock an hour out all come back as one opaque 400
 * from Google, and the only symptom in production is notifications that never
 * arrive.
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const ENV_KEYS = ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

describe("FCM configuration", () => {
  it("reports not configured until all three credentials are present", async () => {
    const { fcmConfigured } = await import(
      "@/server/notifications/channels/fcm"
    );
    expect(fcmConfigured()).toBe(false);

    process.env.FCM_PROJECT_ID = "alpha-workspace";
    expect(fcmConfigured()).toBe(false);

    process.env.FCM_CLIENT_EMAIL = "push@alpha-workspace.iam.gserviceaccount.com";
    expect(fcmConfigured()).toBe(false);

    process.env.FCM_PRIVATE_KEY = PEM;
    expect(fcmConfigured()).toBe(true);
  });

  it("skips rather than throws when nothing is configured", async () => {
    const { sendFcm } = await import("@/server/notifications/channels/fcm");
    // The web push channel behaves the same way with no VAPID keys: a missing
    // credential is a deployment fact, and a nudge failing must never take the
    // surrounding write down with it.
    await expect(sendFcm("device-token", {
      title: "t",
      body: "b",
      url: "/app",
      type: "task_assigned",
    })).resolves.toBe("not-configured");
  });

  it("unescapes a PEM pasted into an env var as a single line", async () => {
    const { fcmConfigured } = await import(
      "@/server/notifications/channels/fcm"
    );
    process.env.FCM_PROJECT_ID = "alpha-workspace";
    process.env.FCM_CLIENT_EMAIL = "push@alpha-workspace.iam.gserviceaccount.com";
    // How every deploy UI stores it, because env vars cannot hold newlines.
    process.env.FCM_PRIVATE_KEY = PEM.replace(/\n/g, "\\n");
    expect(fcmConfigured()).toBe(true);
  });
});

describe("the service account assertion", () => {
  it("is a real RS256 JWT with the claims Google requires", async () => {
    const { buildAssertion } = await import(
      "@/server/notifications/channels/fcm"
    );
    const now = 1_784_714_400;
    const assertion = buildAssertion(
      {
        projectId: "alpha-workspace",
        clientEmail: "push@alpha-workspace.iam.gserviceaccount.com",
        privateKey: PEM,
      },
      now,
    );

    const [header, claims, signature] = assertion.split(".");
    expect(decodeSegment(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodeSegment(claims)).toEqual({
      iss: "push@alpha-workspace.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });

    // The signature has to actually verify: a base64 blob that merely looks
    // right would pass every assertion above and still be rejected by Google.
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    const raw = signature.replace(/-/g, "+").replace(/_/g, "/");
    expect(verifier.verify(publicKey, Buffer.from(raw, "base64"))).toBe(true);
  });

  it("is base64url, so it survives a form-encoded POST body", async () => {
    // "+" and "/" would be mangled by the token exchange's urlencoded body,
    // and "=" padding is not accepted in a JWT segment.
    const { buildAssertion } = await import(
      "@/server/notifications/channels/fcm"
    );
    const assertion = buildAssertion(
      {
        projectId: "p",
        clientEmail: "e@example.test",
        privateKey: PEM,
      },
      1,
    );
    expect(assertion).not.toMatch(/[+/=]/);
  });
});

/**
 * Pruning a token is destructive and invisible: the phone simply stops getting
 * notifications until the app is next launched. So which HTTP statuses mean
 * "this token is dead" is pinned here, in both directions.
 */
describe("which FCM failures kill a device token", () => {
  const message = {
    title: "t",
    body: "b",
    url: "/app",
    type: "task_assigned",
  };

  /** Answers the OAuth exchange, then the send, with `status`. */
  function stubFetch(status: number): typeof globalThis.fetch {
    return (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(
          JSON.stringify({ access_token: "stub", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status });
    }) as typeof globalThis.fetch;
  }

  async function send(status: number) {
    process.env.FCM_PROJECT_ID = "alpha-workspace";
    process.env.FCM_CLIENT_EMAIL = "push@alpha-workspace.iam.gserviceaccount.com";
    process.env.FCM_PRIVATE_KEY = PEM;
    const original = globalThis.fetch;
    globalThis.fetch = stubFetch(status);
    try {
      // Fresh module each time: the access token is cached in module scope,
      // so a second case would reuse the first one's and skip the exchange.
      vi.resetModules();
      const { sendFcm } = await import(
        "@/server/notifications/channels/fcm"
      );
      return await sendFcm("device-token", message);
    } finally {
      globalThis.fetch = original;
    }
  }

  it("treats 404 UNREGISTERED as a dead token", async () => {
    expect(await send(404)).toBe("unregistered");
  });

  it("treats 403 SENDER_ID_MISMATCH as a dead token", async () => {
    expect(await send(403)).toBe("unregistered");
  });

  it("does NOT treat 400 as a dead token", async () => {
    // FCM answers 400 INVALID_ARGUMENT for any malformed request, an
    // oversized payload included. Pruning on it would let a single bad message
    // deregister every recipient's phone at once.
    expect(await send(400)).toBe("failed");
  });

  it("does not prune on a server-side fault either", async () => {
    expect(await send(500)).toBe("failed");
    expect(await send(503)).toBe("failed");
  });
});

describe("native push token validation", () => {
  const valid = {
    token: "f".repeat(163),
    platform: "android" as const,
    userAgent: "AlphaShell/1 (android)",
  };

  it("accepts a realistic FCM registration token", () => {
    expect(nativePushSchema.parse(valid).token).toBe(valid.token);
  });

  it("makes userAgent optional, since a token alone is enough to deliver", () => {
    const parsed = nativePushSchema.parse({
      token: valid.token,
      platform: "ios",
    });
    expect(parsed.userAgent).toBeUndefined();
  });

  it("refuses a platform the shell does not have", () => {
    expect(() =>
      nativePushSchema.parse({ ...valid, platform: "web" }),
    ).toThrow();
    expect(() =>
      nativePushSchema.parse({ ...valid, platform: "windows" }),
    ).toThrow();
  });

  it("refuses an empty, stubby or absurd token", () => {
    // The lower bound keeps junk out of a unique index; the upper bound stops
    // the table being used as storage by anyone with a session.
    expect(() => nativePushSchema.parse({ ...valid, token: "" })).toThrow();
    expect(() => nativePushSchema.parse({ ...valid, token: "abc" })).toThrow();
    expect(() =>
      nativePushSchema.parse({ ...valid, token: "f".repeat(4097) }),
    ).toThrow();
  });

  it("requires a token on the delete path too, not a bare request", () => {
    expect(() => nativePushDeleteSchema.parse({})).toThrow();
    expect(nativePushDeleteSchema.parse({ token: valid.token }).token).toBe(
      valid.token,
    );
  });
});
