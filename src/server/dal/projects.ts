/**
 * Project data access. Creating projects enforces the plan's active-project
 * limit; archiving is always allowed (never trap data behind a paywall).
 */
import { and, asc, count, eq, sql } from "drizzle-orm";
import { memberships, projects, tasks, users } from "@/server/db/schema";
import type { ProjectDTO, UserLite } from "@/lib/types";
import { todaySAST } from "@/lib/dates";
import { assertRole, ctxEntitlements, type Ctx } from "./context";
import { logActivity } from "./activity";
import { LimitError, NotFoundError, ValidationError } from "./errors";

const leadLite = {
  id: users.id,
  name: users.name,
  email: users.email,
  image: users.image,
};

function toDTO(
  row: typeof projects.$inferSelect,
  lead: UserLite | null = null,
): ProjectDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    color: row.color,
    status: row.status,
    clientName: row.clientName,
    leadId: row.leadId,
    lead,
    position: row.position,
  };
}

export async function listProjects(
  ctx: Ctx,
  opts: { includeArchived?: boolean } = {},
): Promise<ProjectDTO[]> {
  const today = todaySAST();
  const rows = await ctx.db
    .select({
      project: projects,
      lead: leadLite,
      openCount: count(tasks.id),
      overdueCount: count(sql`case when ${tasks.dueDate} < ${today} then 1 end`),
    })
    .from(projects)
    .leftJoin(
      tasks,
      and(
        eq(tasks.projectId, projects.id),
        sql`${tasks.status} != 'done'`,
      ),
    )
    .leftJoin(users, eq(users.id, projects.leadId))
    .where(
      and(
        eq(projects.workspaceId, ctx.workspace.id),
        opts.includeArchived ? undefined : eq(projects.status, "active"),
      ),
    )
    .groupBy(projects.id, users.id)
    .orderBy(asc(projects.position), asc(projects.createdAt));

  return rows.map((r) => ({
    ...toDTO(r.project, r.lead?.id ? r.lead : null),
    openCount: r.openCount,
    overdueCount: r.overdueCount,
  }));
}

export async function getProject(ctx: Ctx, projectId: string): Promise<ProjectDTO> {
  const [row] = await ctx.db
    .select({ project: projects, lead: leadLite })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.leadId))
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspace.id)),
    );
  if (!row) throw new NotFoundError("Project not found");
  return toDTO(row.project, row.lead?.id ? row.lead : null);
}

export async function createProject(
  ctx: Ctx,
  input: { id?: string; name: string; color: string; clientName?: string | null },
): Promise<ProjectDTO> {
  assertRole(ctx, "admin");

  const limits = ctxEntitlements(ctx);
  if (limits.maxActiveProjects !== null) {
    const [row] = await ctx.db
      .select({ n: count() })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, ctx.workspace.id),
          eq(projects.status, "active"),
        ),
      );
    if ((row?.n ?? 0) >= limits.maxActiveProjects) {
      throw new LimitError(
        "projects",
        `Your plan includes ${limits.maxActiveProjects} active projects, archive one or upgrade for unlimited`,
      );
    }
  }

  const [maxPos] = await ctx.db
    .select({ max: sql<number | null>`max(${projects.position})` })
    .from(projects)
    .where(eq(projects.workspaceId, ctx.workspace.id));

  const [row] = await ctx.db
    .insert(projects)
    .values({
      ...(input.id ? { id: input.id } : {}),
      workspaceId: ctx.workspace.id,
      name: input.name,
      color: input.color,
      clientName: input.clientName ?? null,
      position: (maxPos?.max ?? 0) + 1024,
      createdBy: ctx.userId,
    })
    .onConflictDoNothing({ target: projects.id })
    .returning();

  if (!row) return getProject(ctx, input.id!);

  await logActivity(ctx.db, {
    workspaceId: ctx.workspace.id,
    type: "project_created",
    actorId: ctx.userId,
    projectId: row.id,
    data: { name: row.name },
  });

  return toDTO(row);
}

export async function updateProject(
  ctx: Ctx,
  projectId: string,
  input: {
    name?: string;
    color?: string;
    clientName?: string | null;
    leadId?: string | null;
    status?: "active" | "archived";
    position?: number;
  },
): Promise<ProjectDTO> {
  assertRole(ctx, "admin");
  const existing = await getProject(ctx, projectId);

  // A lead must be a member of this workspace, never an arbitrary user id.
  if (input.leadId != null) {
    const [member] = await ctx.db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, ctx.workspace.id),
          eq(memberships.userId, input.leadId),
        ),
      );
    if (!member) throw new ValidationError("The lead must be a workspace member");
  }

  const archiving = input.status === "archived" && existing.status === "active";

  const [row] = await ctx.db
    .update(projects)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.clientName !== undefined ? { clientName: input.clientName } : {}),
      ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(archiving ? { archivedAt: new Date() } : {}),
      ...(input.status === "active" ? { archivedAt: null } : {}),
    })
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspace.id)),
    )
    .returning();
  if (!row) throw new NotFoundError("Project not found");

  await logActivity(ctx.db, {
    workspaceId: ctx.workspace.id,
    type: archiving ? "project_archived" : "project_updated",
    actorId: ctx.userId,
    projectId,
    data: archiving ? { name: row.name } : { fields: Object.keys(input) },
  });

  return getProject(ctx, projectId);
}
