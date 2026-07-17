import { api, json } from "@/server/api-utils";
import { requireUser, withWorkspace } from "@/server/session";
import { listProjects } from "@/server/dal/projects";
import { listMembers, workspaceUsage } from "@/server/dal/workspaces";
import { listLabels } from "@/server/dal/labels";
import { unreadCount } from "@/server/dal/notifications";
import { transcriptionConfigured } from "@/server/ai/transcribe";
import { isOperator } from "@/server/admin/operator";
import { db } from "@/server/db";

/**
 * One round trip that boots the app shell: workspace + my role, projects,
 * members, labels, plan usage, unread count. Cached by the service worker
 * for offline starts.
 */
export const GET = api(async (_req, params) => {
  const user = await requireUser();
  const ctx = await withWorkspace(params.ws);

  const [projects, members, labels, usage, unread, operator] = await Promise.all([
    listProjects(ctx),
    listMembers(ctx),
    listLabels(ctx),
    workspaceUsage(ctx),
    unreadCount(db, user.id),
    isOperator(user),
  ]);

  return json({
    workspace: {
      id: ctx.workspace.id,
      name: ctx.workspace.name,
      slug: ctx.workspace.slug,
      plan: ctx.workspace.plan,
      role: ctx.role,
      settings: ctx.workspace.settings,
    },
    serverTranscribe: transcriptionConfigured(),
    isOperator: operator,
    me: user,
    projects,
    members,
    labels,
    usage,
    unread,
  });
});
