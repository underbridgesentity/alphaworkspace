import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { runMorningJobs } from "@/server/jobs/morning";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron: daily 04:00 UTC = 06:00 SAST. Guarded by CRON_SECRET. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runMorningJobs(db);
  return NextResponse.json(result);
}
