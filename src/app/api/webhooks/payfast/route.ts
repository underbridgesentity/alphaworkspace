import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { processItn } from "@/server/payfast/itn";

export const dynamic = "force-dynamic";

/**
 * PayFast ITN webhook. Authenticated by signature + merchant id + server
 * postback inside processItn, never by session. Always 200: PayFast
 * retries hard on non-200 and we log our own failures.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const result = await processItn(db, raw);
    if (!result.ok) {
      console.warn("[payfast:itn] rejected:", result.reason);
    }
  } catch (err) {
    console.error("[payfast:itn] error", err);
  }
  return new NextResponse("OK", { status: 200 });
}
