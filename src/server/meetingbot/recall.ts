import "server-only";

/**
 * Recall.ai client, the meeting-bot vendor (M3, paid add-on). The bot joins
 * a Zoom/Meet/Teams call as a visible participant named after us (people
 * SEE they're being recorded, which is the consent posture we want), records
 * mixed audio, and webhooks us when it's done. We then pull the MP3 and run
 * the exact same Deepgram + Claude pipeline as device recordings.
 *
 * Activates when RECALL_API_KEY (+ RECALL_WEBHOOK_SECRET for webhooks) is
 * set. Region via RECALL_REGION, default us-west-2 (pay-as-you-go).
 */
import { createHmac } from "node:crypto";
import { safeEqual } from "@/server/security";

export function recallConfigured(): boolean {
  return Boolean(process.env.RECALL_API_KEY);
}

const BASE = () =>
  `https://${process.env.RECALL_REGION ?? "us-west-2"}.recall.ai/api/v1`;

async function recall(path: string, init: RequestInit = {}): Promise<Response> {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new Error("Recall not configured");
  return fetch(`${BASE()}${path}`, {
    ...init,
    headers: {
      authorization: `Token ${key}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export const BOT_NAME = "Alpha Workspace notetaker";

/** Send a bot to a call; returns the Recall bot id. */
export async function createBot(input: {
  meetingUrl: string;
  metadata: Record<string, string>;
}): Promise<{ botId: string }> {
  const res = await recall("/bot/", {
    method: "POST",
    body: JSON.stringify({
      meeting_url: input.meetingUrl,
      bot_name: BOT_NAME,
      recording_config: { audio_mixed_mp3: {} },
      metadata: input.metadata,
      // Don't burn minutes sitting in empty rooms or lobbies.
      automatic_leave: {
        waiting_room_timeout: 1800,
        noone_joined_timeout: 900,
        everyone_left_timeout: 60,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`recall create ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error("recall create: no bot id in response");
  return { botId: body.id };
}

/**
 * The finished recording's presigned MP3 URL, or null while it's not ready.
 * Two hops: bot -> recordings[0].id -> audio_mixed list.
 */
export async function botAudioUrl(botId: string): Promise<string | null> {
  const botRes = await recall(`/bot/${botId}/`);
  if (!botRes.ok) {
    throw new Error(`recall bot ${botRes.status}: ${(await botRes.text()).slice(0, 300)}`);
  }
  const bot = (await botRes.json()) as {
    recordings?: {
      id?: string;
      media_shortcuts?: { audio_mixed?: { data?: { download_url?: string } } };
    }[];
  };
  const rec = bot.recordings?.[0];
  if (!rec) return null;
  // Shortcut first (one hop), then the dedicated endpoint.
  const shortcut = rec.media_shortcuts?.audio_mixed?.data?.download_url;
  if (shortcut) return shortcut;
  if (!rec.id) return null;

  const audioRes = await recall(`/audio_mixed/?recording_id=${rec.id}`);
  if (!audioRes.ok) {
    throw new Error(
      `recall audio ${audioRes.status}: ${(await audioRes.text()).slice(0, 300)}`,
    );
  }
  const audio = (await audioRes.json()) as {
    results?: { data?: { download_url?: string } }[];
  };
  return audio.results?.[0]?.data?.download_url ?? null;
}

/* --------------------------- webhook signature ---------------------------- */

/**
 * Recall delivers webhooks via Svix. Signed content is "{id}.{timestamp}.{body}",
 * HMAC-SHA256 with the base64-decoded part after "whsec_", base64 output,
 * matched against any "v1,<sig>" entry. Timestamp must be within 5 minutes.
 */
export function verifyRecallWebhook(
  headers: { get(name: string): string | null },
  rawBody: string,
  secret: string | undefined = process.env.RECALL_WEBHOOK_SECRET,
  nowMs: number = Date.now(),
): boolean {
  if (!secret) return false;
  const id =
    headers.get("webhook-id") ?? headers.get("svix-id") ?? "";
  const timestamp =
    headers.get("webhook-timestamp") ?? headers.get("svix-timestamp") ?? "";
  const signatures =
    headers.get("webhook-signature") ?? headers.get("svix-signature") ?? "";
  if (!id || !timestamp || !signatures) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  return signatures
    .split(" ")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((entry) => {
      const [version, sig] = entry.split(",", 2);
      return version === "v1" && Boolean(sig) && safeEqual(sig, expected);
    });
}

