/**
 * Workspace-scoped labels.
 */
import { and, asc, eq } from "drizzle-orm";
import { labels } from "@/server/db/schema";
import type { LabelDTO } from "@/lib/types";
import type { Ctx } from "./context";
import { ValidationError } from "./errors";

export async function listLabels(ctx: Ctx): Promise<LabelDTO[]> {
  const rows = await ctx.db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(labels)
    .where(eq(labels.workspaceId, ctx.workspace.id))
    .orderBy(asc(labels.name));
  return rows;
}

export async function createLabel(
  ctx: Ctx,
  input: { name: string; color: string },
): Promise<LabelDTO> {
  const existing = await ctx.db
    .select({ id: labels.id })
    .from(labels)
    .where(
      and(eq(labels.workspaceId, ctx.workspace.id), eq(labels.name, input.name)),
    )
    .limit(1);
  if (existing[0]) throw new ValidationError("That label already exists");

  const [row] = await ctx.db
    .insert(labels)
    .values({
      workspaceId: ctx.workspace.id,
      name: input.name,
      color: input.color,
    })
    .returning({ id: labels.id, name: labels.name, color: labels.color });
  return row;
}
