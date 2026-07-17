import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { runMorningJobs } from "@/server/jobs/morning";
import { bearerMatches } from "@/server/security";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron: daily 04:00 UTC = 06:00 SAST. Guarded by CRON_SECRET. */
export async function GET(req: NextRequest) {
  if (!bearerMatches(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runMorningJobs(db);
  return NextResponse.json(result);
}
