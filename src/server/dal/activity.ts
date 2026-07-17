/**
 * Activity log writer. Called from inside DAL mutations only, one place,
 * so the append-only log that powers KPIs and the narrative can't drift.
 */
import type { Db } from "@/server/db";
import { activityEvents } from "@/server/db/schema";
import type { ActivityType } from "@/lib/types";

export interface ActivityInput {
  workspaceId: string;
  type: ActivityType;
  actorId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  data?: Record<string, unknown>;
}

type DbLike = Pick<Db, "insert">;

export async function logActivity(db: DbLike, event: ActivityInput): Promise<void>;
export async function logActivity(db: DbLike, events: ActivityInput[]): Promise<void>;
export async function logActivity(
  db: DbLike,
  input: ActivityInput | ActivityInput[],
): Promise<void> {
  const events = Array.isArray(input) ? input : [input];
  if (events.length === 0) return;
  await db.insert(activityEvents).values(
    events.map((e) => ({
      workspaceId: e.workspaceId,
      type: e.type,
      actorId: e.actorId ?? null,
      projectId: e.projectId ?? null,
      taskId: e.taskId ?? null,
      data: e.data ?? {},
    })),
  );
}
