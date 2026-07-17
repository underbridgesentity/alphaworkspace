import { z } from "zod";
import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { logTime, runningTimer, startTimer, stopTimer } from "@/server/dal/time";
import { timeLogSchema, timeStartSchema } from "@/lib/validators";

/** The caller's running timer (topbar chip polls this). */
export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ running: await runningTimer(ctx) });
});

const actionSchema = z.discriminatedUnion("action", [
  timeStartSchema.extend({ action: z.literal("start") }),
  z.object({ action: z.literal("stop") }),
  timeLogSchema.extend({ action: z.literal("log") }),
]);

/** start | stop | log, one endpoint so the offline queue stays trivial. */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, actionSchema);
  if (input.action === "start") {
    return json({ running: await startTimer(ctx, input.taskId) });
  }
  if (input.action === "stop") {
    return json(await stopTimer(ctx));
  }
  return json(await logTime(ctx, input), { status: 201 });
});
