/**
 * The one-click "Agency starter" template. Seeds a realistic sample client
 * project so the product is never empty and the first board teaches itself.
 * Goes through createTask/updateTask so the activity log looks real too.
 */
import { addDays, todaySAST } from "@/lib/dates";
import { createLabel } from "./labels";
import { createTask, updateTask } from "./tasks";
import { projects } from "@/server/db/schema";
import { logActivity } from "./activity";
import { sql } from "drizzle-orm";
import type { Ctx } from "./context";

export async function seedStarterProject(ctx: Ctx): Promise<{ projectId: string }> {
  const today = todaySAST();

  // Bypass createProject's admin+limit checks deliberately: the starter is
  // part of onboarding for a brand-new workspace (creator is the owner).
  const [maxPos] = await ctx.db
    .select({ max: sql<number | null>`max(${projects.position})` })
    .from(projects);
  const [project] = await ctx.db
    .insert(projects)
    .values({
      workspaceId: ctx.workspace.id,
      name: "Website refresh. Karoo Coffee",
      color: "#5B7C99",
      clientName: "Karoo Coffee Co.",
      position: (maxPos?.max ?? 0) + 1024,
      createdBy: ctx.userId,
    })
    .returning();
  await logActivity(ctx.db, {
    workspaceId: ctx.workspace.id,
    type: "project_created",
    actorId: ctx.userId,
    projectId: project.id,
    data: { name: project.name },
  });

  const design = await createLabel(ctx, { name: "Design", color: "#5B7C99" });
  const copy = await createLabel(ctx, { name: "Copy", color: "#D9A13B" });
  const dev = await createLabel(ctx, { name: "Dev", color: "#6FAE87" });
  await createLabel(ctx, { name: "Admin", color: "#66757C"});

  const t = (
    title: string,
    opts: Partial<{
      description: string;
      status: "todo" | "in_progress" | "done";
      dueDate: string | null;
      priority: "none" | "low" | "med" | "high";
      labelIds: string[];
      assignMe: boolean;
    }> = {},
  ) =>
    createTask(ctx, {
      projectId: project.id,
      title,
      description: opts.description ?? "",
      status: opts.status ?? "todo",
      assigneeId: opts.assignMe ? ctx.userId : null,
      dueDate: opts.dueDate ?? null,
      priority: opts.priority ?? "none",
      labelIds: opts.labelIds ?? [],
      position: undefined,
    });

  await t("Kickoff call with Karoo Coffee", {
    description:
      "Notes live in the task, try the **description**, and leave a comment below.\n\nAlpha tip: hold the mic button after a client call and speak everything that needs doing. You'll get a reviewable task list, not a mess.",
    status: "in_progress",
    dueDate: today,
    priority: "high",
    assignMe: true,
  });
  await t("Moodboard: three visual directions", {
    status: "in_progress",
    dueDate: addDays(today, 2),
    priority: "med",
    labelIds: [design.id],
    assignMe: true,
  });
  await t("Homepage wireframe", {
    dueDate: addDays(today, 3),
    priority: "med",
    labelIds: [design.id],
  });
  await t("Write homepage + about copy", {
    dueDate: addDays(today, 5),
    priority: "med",
    labelIds: [copy.id],
  });
  await t("Product photography shot list", {
    description: "Drag me to *In progress* when you start, the board is drag and drop (or use the keyboard).",
    dueDate: addDays(today, 7),
    labelIds: [design.id],
  });
  await t("Set up staging environment", {
    dueDate: addDays(today, 8),
    labelIds: [dev.id],
  });
  await t("Build homepage", {
    dueDate: addDays(today, 12),
    priority: "med",
    labelIds: [dev.id],
  });
  await t("Client review round 1", {
    dueDate: addDays(today, 14),
    priority: "high",
  });

  // One finished task so the dashboard has signal from minute one.
  const done = await t("Proposal signed 🎉", {
    status: "in_progress",
    priority: "low",
    assignMe: true,
  });
  await updateTask(ctx, done.id, { status: "done" });

  return { projectId: project.id };
}
