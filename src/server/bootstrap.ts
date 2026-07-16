import "server-only";
import type { Ctx } from "@/server/dal/context";
import type { SessionUser } from "@/server/session";
import { listProjects } from "@/server/dal/projects";
import { listMembers, workspaceUsage } from "@/server/dal/workspaces";
import { listLabels } from "@/server/dal/labels";
import { unreadCount } from "@/server/dal/notifications";
import { db } from "@/server/db";

/** Everything the app shell needs, in one query burst. */
export async function getBootstrap(ctx: Ctx, user: SessionUser) {
  const [projects, members, labels, usage, unread] = await Promise.all([
    listProjects(ctx),
    listMembers(ctx),
    listLabels(ctx),
    workspaceUsage(ctx),
    unreadCount(db, user.id),
  ]);

  return {
    workspace: {
      id: ctx.workspace.id,
      name: ctx.workspace.name,
      slug: ctx.workspace.slug,
      plan: ctx.workspace.plan,
      role: ctx.role,
      settings: ctx.workspace.settings,
    },
    me: user,
    projects,
    members,
    labels,
    usage,
    unread,
  };
}

export type Bootstrap = Awaited<ReturnType<typeof getBootstrap>>;
