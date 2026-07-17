import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { runWeeklyNarratives } from "@/server/jobs/weekly-narrative";
import { bearerMatches } from "@/server/security";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron: Monday 04:30 UTC = 06:30 SAST. Guarded by CRON_SECRET. */
export async function GET(req: NextRequest) {
  if (!bearerMatches(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runWeeklyNarratives(db);
  return NextResponse.json(result);
}
