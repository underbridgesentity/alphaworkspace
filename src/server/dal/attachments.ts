/**
 * Task attachments. Bytes live in Supabase Storage; rows here are metadata +
 * the storage key. Quota is enforced per workspace from the plan config.
 */
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { attachments, tasks, users } from "@/server/db/schema";
import type { AttachmentDTO } from "@/lib/types";
import { ctxEntitlements, type Ctx } from "./context";
import { logActivity } from "./activity";
import { LimitError, NotFoundError, ValidationError } from "./errors";
import {
  deleteObject,
  ensureBucket,
  objectSize,
  signedDownloadUrl,
  signedUploadUrl,
  storageConfigured,
} from "@/server/storage";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Long enough to start the download, short enough that history is stale. */
const ATTACHMENT_DOWNLOAD_TTL = 120;
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|avif|heic)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|application\/vnd\.ms-excel)$/i;

/**
 * Confirmed bytes only. An unconfirmed row is a reservation whose bytes may
 * never arrive, so counting it would let anyone exhaust the workspace quota by
 * calling beginUpload in a loop and never uploading.
 */
export async function usedAttachmentBytes(ctx: Ctx): Promise<number> {
  const [row] = await ctx.db
    .select({ total: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)` })
    .from(attachments)
    .where(
      and(
        eq(attachments.workspaceId, ctx.workspace.id),
        isNotNull(attachments.confirmedAt),
      ),
    );
  return Number(row?.total ?? 0);
}

/** Step 1: reserve an upload slot after quota/type checks; returns a signed PUT url. */
export async function beginUpload(
  ctx: Ctx,
  taskId: string,
  file: { name: string; mime: string; sizeBytes: number },
): Promise<{ attachmentId: string; uploadUrl: string; storagePath: string }> {
  if (!storageConfigured()) {
    throw new ValidationError("File attachments aren't enabled on this server yet");
  }
  const [task] = await ctx.db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)));
  if (!task) throw new NotFoundError("Task not found");

  if (file.sizeBytes > MAX_FILE_BYTES) {
    throw new ValidationError("Files are capped at 25 MB each");
  }
  if (!ALLOWED.test(file.mime)) {
    throw new ValidationError("That file type isn't supported");
  }

  const quotaBytes = ctxEntitlements(ctx).attachmentQuotaMb * 1024 * 1024;
  const used = await usedAttachmentBytes(ctx);
  if (used + file.sizeBytes > quotaBytes) {
    throw new LimitError(
      "storage",
      `Your plan's file storage is full (${ctxEntitlements(ctx).attachmentQuotaMb} MB)`,
    );
  }

  await ensureBucket();
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const storagePath = `${ctx.workspace.id}/${taskId}/${id}-${safeName}`;
  const { url } = await signedUploadUrl(storagePath);

  await ctx.db.insert(attachments).values({
    id,
    workspaceId: ctx.workspace.id,
    taskId,
    uploaderId: ctx.userId,
    name: file.name.slice(0, 200),
    mime: file.mime,
    sizeBytes: file.sizeBytes,
    storagePath,
  });

  return { attachmentId: id, uploadUrl: url, storagePath };
}

/**
 * Step 2: the browser confirms the PUT succeeded. Reconcile the real stored
 * size against what the client declared (the quota gate in beginUpload trusts
 * the declared number), then log activity. A caller that under-reports to
 * slip past the quota is corrected here; if the true size busts the per-file
 * cap or the plan quota, the object and row are removed and the upload fails.
 * `resolveSize` is injectable for tests.
 */
export async function confirmUpload(
  ctx: Ctx,
  attachmentId: string,
  opts: { resolveSize?: (path: string) => Promise<number | null> } = {},
): Promise<void> {
  const [row] = await ctx.db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.workspaceId, ctx.workspace.id),
      ),
    );
  if (!row) throw new NotFoundError("Attachment not found");
  // Idempotent: a retried confirm must not log the activity twice.
  if (row.confirmedAt) return;

  const realSize = await (opts.resolveSize ?? objectSize)(row.storagePath);
  const finalSize = realSize ?? row.sizeBytes;
  const discard = async () => {
    await deleteObject(row.storagePath).catch(() => undefined);
    await ctx.db.delete(attachments).where(eq(attachments.id, row.id));
  };

  if (finalSize > MAX_FILE_BYTES) {
    await discard();
    throw new ValidationError("Files are capped at 25 MB each");
  }

  // Re-check the quota on EVERY confirm, not just when the declared size was
  // wrong. beginUpload can only measure confirmed bytes, so N uploads started
  // together each see the same free space; this is where that is settled.
  const quotaBytes = ctxEntitlements(ctx).attachmentQuotaMb * 1024 * 1024;
  const usedConfirmed = await usedAttachmentBytes(ctx); // excludes this row
  if (usedConfirmed + finalSize > quotaBytes) {
    await discard();
    throw new LimitError(
      "storage",
      `Your plan's file storage is full (${ctxEntitlements(ctx).attachmentQuotaMb} MB)`,
    );
  }

  await ctx.db
    .update(attachments)
    .set({ sizeBytes: finalSize, confirmedAt: new Date() })
    .where(eq(attachments.id, row.id));
  row.sizeBytes = finalSize;

  await logActivity(ctx.db, {
    workspaceId: ctx.workspace.id,
    type: "attachment_added",
    actorId: ctx.userId,
    taskId: row.taskId,
    data: { name: row.name },
  });
}

export async function listAttachments(
  ctx: Ctx,
  taskId: string,
): Promise<AttachmentDTO[]> {
  const rows = await ctx.db
    .select({
      a: attachments,
      uploader: { id: users.id, name: users.name, email: users.email, image: users.image },
    })
    .from(attachments)
    .leftJoin(users, eq(attachments.uploaderId, users.id))
    .where(
      and(
        eq(attachments.taskId, taskId),
        eq(attachments.workspaceId, ctx.workspace.id),
        // Reservations whose bytes never arrived are not files; showing them
        // would offer a download that 404s.
        isNotNull(attachments.confirmedAt),
      ),
    )
    .orderBy(attachments.createdAt);
  return rows.map((r) => ({
    id: r.a.id,
    taskId: r.a.taskId,
    name: r.a.name,
    mime: r.a.mime,
    sizeBytes: r.a.sizeBytes,
    createdAt: r.a.createdAt.toISOString(),
    uploader: r.uploader?.id ? r.uploader : null,
  }));
}

export async function attachmentDownloadUrl(
  ctx: Ctx,
  attachmentId: string,
): Promise<string> {
  const [row] = await ctx.db
    .select({ storagePath: attachments.storagePath })
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.workspaceId, ctx.workspace.id),
      ),
    );
  if (!row) throw new NotFoundError("Attachment not found");
  // The route 302s the browser here, so this URL lands in history. Keep the
  // window short: it is a bearer capability that needs no session to redeem.
  return signedDownloadUrl(row.storagePath, ATTACHMENT_DOWNLOAD_TTL);
}

export async function deleteAttachment(ctx: Ctx, attachmentId: string): Promise<void> {
  const [row] = await ctx.db
    .delete(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.workspaceId, ctx.workspace.id),
      ),
    )
    .returning({ storagePath: attachments.storagePath });
  if (row) await deleteObject(row.storagePath).catch(() => undefined);
}

/**
 * Drop upload reservations whose bytes never arrived. beginUpload writes the
 * row before the PUT, so an abandoned or failed upload leaves a row (and
 * possibly a partial object) behind forever. These already don't count against
 * quota or show in listings, but they still accumulate, so clear them out.
 *
 * Workspace-wide, run from the morning cron, so it takes `db` rather than a
 * Ctx. One hour is far longer than any real browser upload.
 */
export async function sweepUnconfirmedAttachments(
  db: Ctx["db"],
  opts: { now?: Date; olderThanMs?: number } = {},
): Promise<{ removed: number }> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - (opts.olderThanMs ?? 60 * 60_000));
  const stale = await db
    .delete(attachments)
    .where(
      and(isNull(attachments.confirmedAt), lt(attachments.createdAt, cutoff)),
    )
    .returning({ storagePath: attachments.storagePath });
  for (const row of stale) {
    await deleteObject(row.storagePath).catch(() => undefined);
  }
  return { removed: stale.length };
}
