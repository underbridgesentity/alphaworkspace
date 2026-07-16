/**
 * Voice/quick-add capture records. The AI proposes; only confirmation here
 * writes tasks (product law: extract, show, confirm). Captures are kept for
 * quality auditing.
 */
import { and, count, eq, sql } from "drizzle-orm";
import { voiceCaptures } from "@/server/db/schema";
import type { TaskCreateInput } from "@/lib/validators";
import type { TaskDTO } from "@/lib/types";
import { ctxEntitlements, type Ctx } from "./context";
import { createTask } from "./tasks";
import { logActivity } from "./activity";
import { LimitError, NotFoundError, ValidationError } from "./errors";

export async function monthlyVoiceCaptureCount(ctx: Ctx): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [row] = await ctx.db
    .select({ n: count() })
    .from(voiceCaptures)
    .where(
      and(
        eq(voiceCaptures.workspaceId, ctx.workspace.id),
        eq(voiceCaptures.source, "voice"),
        sql`${voiceCaptures.createdAt} >= ${monthStart}`,
      ),
    );
  return row?.n ?? 0;
}

export async function assertVoiceCaptureAvailable(ctx: Ctx): Promise<void> {
  const limits = ctxEntitlements(ctx);
  const used = await monthlyVoiceCaptureCount(ctx);
  if (used >= limits.voiceCapturesPerMonth) {
    throw new LimitError(
      "captures",
      `You've used your ${limits.voiceCapturesPerMonth} voice captures this month`,
    );
  }
}

export async function createCapture(
  ctx: Ctx,
  input: {
    transcript: string;
    source: "voice" | "quickadd";
    extraction: Record<string, unknown>;
    engine: string;
  },
) {
  if (input.source === "voice") await assertVoiceCaptureAvailable(ctx);
  const [row] = await ctx.db
    .insert(voiceCaptures)
    .values({
      workspaceId: ctx.workspace.id,
      userId: ctx.userId,
      source: input.source,
      transcript: input.transcript,
      extraction: input.extraction,
      engine: input.engine,
    })
    .returning();
  return row;
}

/** Confirmation is the only path from proposals to real tasks. */
export async function confirmCapture(
  ctx: Ctx,
  captureId: string,
  taskInputs: TaskCreateInput[],
): Promise<TaskDTO[]> {
  const [capture] = await ctx.db
    .select()
    .from(voiceCaptures)
    .where(
      and(
        eq(voiceCaptures.id, captureId),
        eq(voiceCaptures.workspaceId, ctx.workspace.id),
        eq(voiceCaptures.userId, ctx.userId),
      ),
    );
  if (!capture) throw new NotFoundError("Capture not found");
  if (capture.status !== "draft") {
    throw new ValidationError("This capture was already resolved");
  }

  const created: TaskDTO[] = [];
  for (const t of taskInputs) {
    created.push(await createTask(ctx, t));
  }

  await ctx.db
    .update(voiceCaptures)
    .set({
      status: "confirmed",
      createdTaskIds: created.map((t) => t.id),
      resolvedAt: new Date(),
    })
    .where(eq(voiceCaptures.id, captureId));

  await logActivity(ctx.db, {
    workspaceId: ctx.workspace.id,
    type: "capture_confirmed",
    actorId: ctx.userId,
    data: { count: created.length, source: capture.source },
  });

  return created;
}

export async function discardCapture(ctx: Ctx, captureId: string): Promise<void> {
  const [row] = await ctx.db
    .update(voiceCaptures)
    .set({ status: "discarded", resolvedAt: new Date() })
    .where(
      and(
        eq(voiceCaptures.id, captureId),
        eq(voiceCaptures.workspaceId, ctx.workspace.id),
        eq(voiceCaptures.userId, ctx.userId),
        eq(voiceCaptures.status, "draft"),
      ),
    )
    .returning({ id: voiceCaptures.id });
  if (!row) throw new NotFoundError("Capture not found");
}
