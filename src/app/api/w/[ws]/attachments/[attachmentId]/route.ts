import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import {
  attachmentDownloadUrl,
  confirmUpload,
  deleteAttachment,
} from "@/server/dal/attachments";

/** Redirect to a short-lived signed download URL. */
export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  const url = await attachmentDownloadUrl(ctx, params.attachmentId);
  return Response.redirect(url, 302);
});

/** Step 2 of upload: the browser confirms the PUT succeeded. */
export const POST = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await confirmUpload(ctx, params.attachmentId);
  return json({ ok: true });
});

export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await deleteAttachment(ctx, params.attachmentId);
  return json({ ok: true });
});
