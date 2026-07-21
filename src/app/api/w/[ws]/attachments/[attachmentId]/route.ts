import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import {
  attachmentDownloadUrl,
  confirmUpload,
  deleteAttachment,
} from "@/server/dal/attachments";

/**
 * Redirect to a short-lived signed download URL. The signed URL is a bearer
 * capability, so don't let it be cached or leak through the Referer header on
 * the way out; the TTL (see attachmentDownloadUrl) is the real control.
 */
export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  const url = await attachmentDownloadUrl(ctx, params.attachmentId);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
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
