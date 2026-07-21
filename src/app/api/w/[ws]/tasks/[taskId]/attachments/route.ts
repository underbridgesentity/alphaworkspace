import { z } from "zod";
import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { beginUpload, listAttachments } from "@/server/dal/attachments";
import { checkRateLimit } from "@/server/ai/ratelimit";
import { LimitError } from "@/server/dal/errors";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ attachments: await listAttachments(ctx, params.taskId) });
});

const beginSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mime: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(26_214_400),
});

/** Step 1 of upload: returns a signed URL the browser PUTs the file to. */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  // Each call writes a row and makes two Supabase round trips before a single
  // byte is uploaded, so cap how fast one person can reserve slots.
  if (!checkRateLimit(`attach-begin:${ctx.userId}`, 20, 60_000)) {
    throw new LimitError("storage", "Too many uploads at once, give it a minute");
  }
  const input = await readJson(req, beginSchema);
  const result = await beginUpload(ctx, params.taskId, input);
  return json(result, { status: 201 });
});
