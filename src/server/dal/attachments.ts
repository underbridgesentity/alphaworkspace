/**
 * Task attachments. Bytes live in Supabase Storage; rows here are metadata +
 * the storage key. Quota is enforced per workspace from the plan config.
 */
import { and, eq, sql } from "drizzle-orm";
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
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|avif|heic)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|application\/vnd\.ms-excel)$/i;

export async function usedAttachmentBytes(ctx: Ctx): Promise<number> {
  const [row] = await ctx.db
    .select({ total: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)` })
    .from(attachments)
    .where(eq(attachments.workspaceId, ctx.workspace.id));
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

  const realSize = await (opts.resolveSize ?? objectSize)(row.storagePath);
  if (realSize !== null && realSize !== row.sizeBytes) {
    const discard = async () => {
      await deleteObject(row.storagePath).catch(() => undefined);
      await ctx.db.delete(attachments).where(eq(attachments.id, row.id));
    };
    if (realSize > MAX_FILE_BYTES) {
      await discard();
      throw new ValidationError("Files are capped at 25 MB each");
    }
    const quotaBytes = ctxEntitlements(ctx).attachmentQuotaMb * 1024 * 1024;
    const usedExcludingThis = (await usedAttachmentBytes(ctx)) - row.sizeBytes;
    if (usedExcludingThis + realSize > quotaBytes) {
      await discard();
      throw new LimitError(
        "captures",
        `Your plan's file storage is full (${ctxEntitlements(ctx).attachmentQuotaMb} MB)`,
      );
    }
    await ctx.db
      .update(attachments)
      .set({ sizeBytes: realSize })
      .where(eq(attachments.id, row.id));
    row.sizeBytes = realSize;
  }

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
      and(eq(attachments.taskId, taskId), eq(attachments.workspaceId, ctx.workspace.id)),
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
  return signedDownloadUrl(row.storagePath);
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
