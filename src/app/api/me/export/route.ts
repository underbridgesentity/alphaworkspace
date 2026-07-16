import { NextResponse } from "next/server";
import { api } from "@/server/api-utils";
import { requireUser } from "@/server/session";
import { db } from "@/server/db";
import { exportUserData } from "@/server/dal/account";

/** POPIA: per-user data export as a JSON download. */
export const GET = api(async () => {
  const user = await requireUser();
  const data = await exportUserData(db, user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="alpha-workspace-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
