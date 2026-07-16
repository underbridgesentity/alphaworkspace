/**
 * Global search — tasks and projects, workspace-scoped, ILIKE with a tight
 * result budget (this is a phone-first product on expensive data).
 */
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { projects, tasks, users } from "@/server/db/schema";
import type { ProjectDTO, TaskDTO } from "@/lib/types";
import type { Ctx } from "./context";

export interface SearchResults {
  tasks: TaskDTO[];
  projects: ProjectDTO[];
}

export async function search(ctx: Ctx, query: string): Promise<SearchResults> {
  const q = `%${query.trim().replace(/[%_]/g, "\\$&")}%`;
  if (query.trim().length < 2) return { tasks: [], projects: [] };

  const [taskRows, projectRows] = await Promise.all([
    ctx.db
      .select({
        task: tasks,
        assignee: {
          id: users.id,
          name: users.name,
          email: users.email,
          image: users.image,
        },
        project: { name: projects.name, color: projects.color },
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(
        and(
          eq(tasks.workspaceId, ctx.workspace.id),
          or(ilike(tasks.title, q), ilike(tasks.description, q)),
        ),
      )
      .orderBy(desc(sql`${tasks.status} != 'done'`), desc(tasks.updatedAt))
      .limit(15),
    ctx.db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, ctx.workspace.id),
          or(ilike(projects.name, q), ilike(projects.clientName, q)),
        ),
      )
      .limit(5),
  ]);

  return {
    tasks: taskRows.map((r) => ({
      id: r.task.id,
      workspaceId: r.task.workspaceId,
      projectId: r.task.projectId,
      title: r.task.title,
      description: "",
      status: r.task.status,
      assigneeId: r.task.assigneeId,
      assignee: r.assignee,
      dueDate: r.task.dueDate,
      priority: r.task.priority,
      position: r.task.position,
      labels: [],
      createdBy: r.task.createdBy,
      createdAt: r.task.createdAt.toISOString(),
      updatedAt: r.task.updatedAt.toISOString(),
      completedAt: r.task.completedAt?.toISOString() ?? null,
      projectName: r.project.name,
      projectColor: r.project.color,
    })),
    projects: projectRows.map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      name: p.name,
      color: p.color,
      status: p.status,
      clientName: p.clientName,
      position: p.position,
    })),
  };
}
