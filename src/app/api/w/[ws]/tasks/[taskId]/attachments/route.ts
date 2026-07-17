import { z } from "zod";
import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { beginUpload, listAttachments } from "@/server/dal/attachments";

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
  const input = await readJson(req, beginSchema);
  const result = await beginUpload(ctx, params.taskId, input);
  return json(result, { status: 201 });
});
