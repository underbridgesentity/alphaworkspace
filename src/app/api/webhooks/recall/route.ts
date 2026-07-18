import { after, NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { verifyRecallWebhook } from "@/server/meetingbot/recall";
import { handleBotStatus } from "@/server/dal/meetings";

/**
 * Recall.ai status webhooks (Svix-signed). Svix expects a 2xx within 15s
 * and retries for 24h, so the heavy path ("done" → fetch audio → transcribe)
 * runs via after(): respond now, work after the response. Duplicate
 * deliveries no-op inside handleBotStatus (status-claim update).
 *
 * Raw body is read manually: the signature covers the exact bytes.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<Response> {
  if (!process.env.RECALL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const raw = await req.text();
  if (!verifyRecallWebhook(req.headers, raw)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: {
    event?: string;
    data?: { data?: { code?: string }; bot?: { id?: string } };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const event = payload.event ?? "";
  const botId = payload.data?.bot?.id;
  if (!event.startsWith("bot.") || !botId) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const code = payload.data?.data?.code ?? event.slice(4);

  if (code === "done") {
    after(async () => {
      try {
        await handleBotStatus(db, botId, code);
      } catch (err) {
        console.error("[webhook:recall] processing failed", err);
      }
    });
    return NextResponse.json({ ok: true });
  }

  await handleBotStatus(db, botId, code);
  return NextResponse.json({ ok: true });
}
