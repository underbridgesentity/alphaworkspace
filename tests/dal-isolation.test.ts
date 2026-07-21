/**
 * The tests that prove the walls hold: cross-workspace reads and writes must
 * fail, role checks must bite, and plan limits must enforce — all through the
 * same DAL production uses.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import {
  acceptInvite,
  changeMemberRole,
  createInvite,
  createWorkspace,
  deleteWorkspace,
  listMembers,
  listWorkspacesForUser,
  removeMember,
  transferOwnership,
  updateWorkspace,
  workspaceUsage,
} from "@/server/dal/workspaces";
import { createProject, listProjects, updateProject } from "@/server/dal/projects";
import {
  boardTasks,
  createTask,
  deleteTask,
  myWork,
  taskDetail,
  updateTask,
} from "@/server/dal/tasks";
import { addComment, toggleReaction } from "@/server/dal/comments";
import { createLabel } from "@/server/dal/labels";
import { search } from "@/server/dal/search";
import {
  listNotifications,
  markRead,
  unreadCount,
} from "@/server/dal/notifications";
import {
  confirmCapture,
  createCapture,
  discardCapture,
} from "@/server/dal/captures";
import {
  ForbiddenError,
  LimitError,
  NotFoundError,
  ValidationError,
} from "@/server/dal/errors";
import { exportUserData, deleteAccount } from "@/server/dal/account";
import { addMember, createTestDb, createTestUser, ctxFor } from "./helpers/db";

let db: Db;
let anna: { id: string; email: string };
let ben: { id: string; email: string };
let cara: { id: string; email: string };
let ws1: { id: string; slug: string };
let ws2: { id: string; slug: string };

beforeAll(async () => {
  db = await createTestDb();
  anna = await createTestUser(db, "anna@studio-one.co.za", "Anna");
  ben = await createTestUser(db, "ben@studio-two.co.za", "Ben");
  cara = await createTestUser(db, "cara@studio-one.co.za", "Cara");
  ws1 = await createWorkspace(db, anna.id, { name: "Studio One", seedStarter: false });
  ws2 = await createWorkspace(db, ben.id, { name: "Studio Two", seedStarter: false });
  await addMember(db, ws1.id, cara.id, "member");
});

describe("workspace context", () => {
  it("resolves for members with their role", async () => {
    const ctx = await ctxFor(db, anna.id, ws1.slug);
    expect(ctx.role).toBe("owner");
    expect(ctx.workspace.id).toBe(ws1.id);
  });

  it("denies non-members indistinguishably from non-existence", async () => {
    await expect(ctxFor(db, ben.id, ws1.slug)).rejects.toBeInstanceOf(NotFoundError);
    await expect(ctxFor(db, anna.id, "no-such-space")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists only the user's workspaces", async () => {
    const mine = await listWorkspacesForUser(db, anna.id);
    expect(mine.map((w) => w.id)).toEqual([ws1.id]);
  });
});

describe("cross-workspace isolation", () => {
  it("blocks reads and writes into another tenant's project and tasks", async () => {
    const ctxA = await ctxFor(db, anna.id, ws1.slug);
    const ctxB = await ctxFor(db, ben.id, ws2.slug);

    const project = await createProject(ctxA, { name: "Brand refresh", color: "#5B7C99" });
    const task = await createTask(ctxA, {
      projectId: project.id,
      title: "Moodboard for Liberty",
      description: "",
      status: "todo",
      priority: "none",
      labelIds: [],
    });

    // Reads from the other tenant fail.
    await expect(boardTasks(ctxB, project.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(taskDetail(ctxB, task.id)).rejects.toBeInstanceOf(NotFoundError);

    // Writes from the other tenant fail.
    await expect(
      createTask(ctxB, {
        projectId: project.id,
        title: "sneaky",
        description: "",
        status: "todo",
        priority: "none",
        labelIds: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateTask(ctxB, task.id, { title: "hijack" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTask(ctxB, task.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addComment(ctxB, task.id, { body: "hi" })).rejects.toBeInstanceOf(NotFoundError);

    // Search and My Work never leak across the wall.
    const found = await search(ctxB, "Moodboard");
    expect(found.tasks).toHaveLength(0);
    const mineB = await myWork(ctxB);
    expect(mineB).toHaveLength(0);
    const foundA = await search(ctxA, "Moodboard");
    expect(foundA.tasks.map((t) => t.id)).toContain(task.id);
  });

  it("rejects assignees and labels that belong to another workspace", async () => {
    const ctxA = await ctxFor(db, anna.id, ws1.slug);
    const ctxB = await ctxFor(db, ben.id, ws2.slug);
    const [projectA] = await listProjects(ctxA);
    const foreignLabel = await createLabel(ctxB, { name: "Urgent", color: "#E0604F" });

    await expect(
      createTask(ctxA, {
        projectId: projectA.id,
        title: "assign outsider",
        description: "",
        status: "todo",
        priority: "none",
        assigneeId: ben.id,
        labelIds: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      createTask(ctxA, {
        projectId: projectA.id,
        title: "foreign label",
        description: "",
        status: "todo",
        priority: "none",
        labelIds: [foreignLabel.id],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  /**
   * The task panel's project switcher sends a projectId straight from the
   * client, so a legitimate actor with a FOREIGN project id is the one path
   * where a client-supplied id reaches an update. The server re-derives the
   * project from the caller's workspace; this pins that.
   */
  it("refuses to move a task into another workspace's project", async () => {
    const ctxA = await ctxFor(db, anna.id, ws1.slug);
    const ctxB = await ctxFor(db, ben.id, ws2.slug);
    const [projectA] = await listProjects(ctxA);
    const foreign = await createProject(ctxB, { name: "Theirs", color: "#5B7C99" });
    const task = await createTask(ctxA, {
      projectId: projectA.id,
      title: "stays put",
      description: "",
      status: "todo",
      priority: "none",
      labelIds: [],
    });

    await expect(
      updateTask(ctxA, task.id, { projectId: foreign.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await taskDetail(ctxA, task.id)).task.projectId).toBe(projectA.id);
  });

  it("scopes reactions to the workspace and leads to its members", async () => {
    const ctxA = await ctxFor(db, anna.id, ws1.slug);
    const ctxB = await ctxFor(db, ben.id, ws2.slug);
    const [projectA] = await listProjects(ctxA);
    const task = await createTask(ctxA, {
      projectId: projectA.id,
      title: "React to me",
      description: "",
      status: "todo",
      priority: "none",
      labelIds: [],
    });
    const comment = await addComment(ctxA, task.id, { body: "shipped" });

    // Toggle on, toggle off; aggregation is viewer-aware.
    expect(await toggleReaction(ctxA, comment.id, "👍")).toEqual({ added: true });
    const caraCtx = await ctxFor(db, cara.id, ws1.slug);
    expect(await toggleReaction(caraCtx, comment.id, "👍")).toEqual({ added: true });
    const detail = await taskDetail(caraCtx, task.id);
    expect(detail.comments[0].reactions).toEqual([
      { emoji: "👍", count: 2, mine: true },
    ]);
    expect(await toggleReaction(ctxA, comment.id, "👍")).toEqual({ added: false });

    // Another tenant can't react to it, indistinguishable from non-existence.
    await expect(toggleReaction(ctxB, comment.id, "👍")).rejects.toBeInstanceOf(
      NotFoundError,
    );

    // A project lead must be a member of the workspace.
    await expect(
      updateProject(ctxA, projectA.id, { leadId: ben.id }),
    ).rejects.toBeInstanceOf(ValidationError);
    const led = await updateProject(ctxA, projectA.id, { leadId: cara.id });
    expect(led.leadId).toBe(cara.id);
    expect(led.lead?.email).toBe(cara.email);
  });
});

describe("roles", () => {
  it("members cannot manage projects, settings, members or invites", async () => {
    const ctxCara = await ctxFor(db, cara.id, ws1.slug);
    await expect(
      createProject(ctxCara, { name: "Side quest", color: "#5B7C99" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateWorkspace(ctxCara, { name: "Renamed" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createInvite(ctxCara, { email: "x@y.co.za", role: "member" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteWorkspace(ctxCara)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("members can create and manage their own work", async () => {
    const ctxCara = await ctxFor(db, cara.id, ws1.slug);
    const [project] = await listProjects(ctxCara);
    const task = await createTask(ctxCara, {
      projectId: project.id,
      title: "Cara's task",
      description: "",
      status: "todo",
      priority: "low",
      assigneeId: cara.id,
      labelIds: [],
    });
    const mine = await myWork(ctxCara);
    expect(mine.map((t) => t.id)).toContain(task.id);
    const updated = await updateTask(ctxCara, task.id, { status: "in_progress" });
    expect(updated.status).toBe("in_progress");
  });

  it("transfers ownership: target becomes owner, caller steps down to admin", async () => {
    const ownerCtx = await ctxFor(db, anna.id, ws1.slug);
    const [caraMembership] = await db
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.workspaceId, ws1.id),
          eq(schema.memberships.userId, cara.id),
        ),
      );

    // A non-owner can't transfer.
    const caraCtx = await ctxFor(db, cara.id, ws1.slug);
    await expect(
      transferOwnership(caraCtx, caraMembership.id),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await transferOwnership(ownerCtx, caraMembership.id);

    const roles = await db
      .select({ userId: schema.memberships.userId, role: schema.memberships.role })
      .from(schema.memberships)
      .where(eq(schema.memberships.workspaceId, ws1.id));
    const byUser = new Map(roles.map((r) => [r.userId, r.role]));
    expect(byUser.get(cara.id)).toBe("owner"); // exactly one owner, now Cara
    expect(byUser.get(anna.id)).toBe("admin"); // Anna stepped down
    expect(roles.filter((r) => r.role === "owner")).toHaveLength(1);

    // Hand it back so the rest of the suite's owner assumptions hold.
    await transferOwnership(await ctxFor(db, cara.id, ws1.slug), (
      await db
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.workspaceId, ws1.id),
            eq(schema.memberships.userId, anna.id),
          ),
        )
    )[0].id);
  });

  it("an admin can't demote themselves out of admin", async () => {
    // Make Cara an admin first (Anna is owner again after the transfer test).
    const ownerCtx = await ctxFor(db, anna.id, ws1.slug);
    const [caraMembership] = await db
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.workspaceId, ws1.id),
          eq(schema.memberships.userId, cara.id),
        ),
      );
    await changeMemberRole(ownerCtx, caraMembership.id, "admin");

    const caraCtx = await ctxFor(db, cara.id, ws1.slug);
    await expect(
      changeMemberRole(caraCtx, caraMembership.id, "member"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // reset
    await changeMemberRole(ownerCtx, caraMembership.id, "member");
  });

  it("unassigns a removed member's open tasks so work isn't stranded", async () => {
    const ownerCtx = await ctxFor(db, anna.id, ws1.slug);
    const [project] = await listProjects(ownerCtx);
    const dan = await createTestUser(db, "dan@studio-one.co.za", "Dan");
    await addMember(db, ws1.id, dan.id, "member");
    const task = await createTask(ownerCtx, {
      projectId: project.id,
      title: "Dan's in-flight work",
      description: "",
      status: "in_progress",
      priority: "none",
      assigneeId: dan.id,
      labelIds: [],
    });

    const [membership] = await db
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.workspaceId, ws1.id),
          eq(schema.memberships.userId, dan.id),
        ),
      );
    await removeMember(ownerCtx, membership.id);

    const [row] = await db
      .select({ assigneeId: schema.tasks.assigneeId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, task.id));
    expect(row.assigneeId).toBeNull();
  });
});

describe("activity log", () => {
  it("records meaningful changes, workspace-scoped", async () => {
    const ctxA = await ctxFor(db, anna.id, ws1.slug);
    const [project] = await listProjects(ctxA);
    const task = await createTask(ctxA, {
      projectId: project.id,
      title: "Log me",
      description: "",
      status: "todo",
      priority: "none",
      labelIds: [],
    });
    await updateTask(ctxA, task.id, { status: "done" });

    const events = await db
      .select()
      .from(schema.activityEvents)
      .where(
        and(
          eq(schema.activityEvents.taskId, task.id),
          eq(schema.activityEvents.workspaceId, ws1.id),
        ),
      );
    const types = events.map((e) => e.type);
    expect(types).toContain("task_created");
    expect(types).toContain("task_completed");

    const detail = await taskDetail(ctxA, task.id);
    expect(detail.task.completedAt).not.toBeNull();
    expect(detail.activity.length).toBeGreaterThanOrEqual(2);
  });

  it("does not log pure reorders", async () => {
    const ctxA = await ctxFor(db, anna.id, ws1.slug);
    const [project] = await listProjects(ctxA);
    const task = await createTask(ctxA, {
      projectId: project.id,
      title: "Reorder me",
      description: "",
      status: "todo",
      priority: "none",
      labelIds: [],
    });
    const before = (
      await db
        .select()
        .from(schema.activityEvents)
        .where(eq(schema.activityEvents.taskId, task.id))
    ).length;
    await updateTask(ctxA, task.id, { position: 99999 });
    const after = (
      await db
        .select()
        .from(schema.activityEvents)
        .where(eq(schema.activityEvents.taskId, task.id))
    ).length;
    expect(after).toBe(before);
  });
});

describe("plan limits (free tier)", () => {
  it("enforces the active-project cap with a friendly LimitError", async () => {
    const ctxA = await ctxFor(db, anna.id, ws1.slug);
    await createProject(ctxA, { name: "Second project", color: "#6FAE87" });
    await expect(
      createProject(ctxA, { name: "One too many", color: "#D9A13B" }),
    ).rejects.toBeInstanceOf(LimitError);

    // Archiving frees a slot — limits never trap existing work.
    const all = await listProjects(ctxA);
    await updateProject(ctxA, all[1].id, { status: "archived" });
    const third = await createProject(ctxA, { name: "Fits now", color: "#D9A13B" });
    expect(third.id).toBeTruthy();
    await updateProject(ctxA, third.id, { status: "archived" });
  });

  it("enforces the member cap across members + pending invites", async () => {
    const ctxA = await ctxFor(db, anna.id, ws1.slug);
    // Free = 3 members; anna + cara = 2, one invite fits…
    const invite = await createInvite(ctxA, {
      email: "dave@studio-one.co.za",
      role: "member",
    });
    // …the next one doesn't.
    await expect(
      createInvite(ctxA, { email: "eve@studio-one.co.za", role: "member" }),
    ).rejects.toBeInstanceOf(LimitError);

    // Wrong account can't accept someone else's invite.
    await expect(
      acceptInvite(db, { id: ben.id, email: ben.email }, invite.token),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const dave = await createTestUser(db, "dave@studio-one.co.za", "Dave");
    const accepted = await acceptInvite(db, dave, invite.token);
    expect(accepted.workspaceSlug).toBe(ws1.slug);
    const members = await listMembers(ctxA);
    expect(members).toHaveLength(3);

    // Cleanly leaving works for members.
    const daveMembership = members.find((m) => m.id === dave.id)!;
    const ctxDave = await ctxFor(db, dave.id, ws1.slug);
    await removeMember(ctxDave, daveMembership.membershipId);
    await expect(ctxFor(db, dave.id, ws1.slug)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("enforces the monthly voice-capture cap via the entitlements snapshot", async () => {
    await db
      .update(schema.workspaces)
      .set({
        entitlements: {
          maxMembers: 3,
          maxActiveProjects: 2,
          voiceCapturesPerMonth: 2,
          features: ["weekly_narrative"],
        },
      })
      .where(eq(schema.workspaces.id, ws1.id));

    const ctxA = await ctxFor(db, anna.id, ws1.slug);
    await createCapture(ctxA, { transcript: "one", source: "voice", extraction: {}, engine: "test" });
    const second = await createCapture(ctxA, { transcript: "two", source: "voice", extraction: {}, engine: "test" });
    await expect(
      createCapture(ctxA, { transcript: "three", source: "voice", extraction: {}, engine: "test" }),
    ).rejects.toBeInstanceOf(LimitError);

    // Quick-add is not capped.
    const qa = await createCapture(ctxA, { transcript: "typed", source: "quickadd", extraction: {}, engine: "test" });
    expect(qa.id).toBeTruthy();

    await discardCapture(ctxA, second.id);
    await db
      .update(schema.workspaces)
      .set({ entitlements: null })
      .where(eq(schema.workspaces.id, ws1.id));
  });
});

describe("capture confirmation", () => {
  it("creates tasks only on confirm, once, by the capture's author", async () => {
    const ctxA = await ctxFor(db, anna.id, ws1.slug);
    const [project] = await listProjects(ctxA);
    const capture = await createCapture(ctxA, {
      transcript: "homepage concepts for karoo, friday",
      source: "quickadd",
      extraction: { proposals: [] },
      engine: "test",
    });

    const created = await confirmCapture(ctxA, capture.id, [
      {
        projectId: project.id,
        title: "Homepage concepts",
        description: "",
        status: "todo",
        priority: "med",
        labelIds: [],
      },
    ]);
    expect(created).toHaveLength(1);

    await expect(confirmCapture(ctxA, capture.id, [])).rejects.toBeInstanceOf(ValidationError);

    // Another member can't resolve someone else's capture.
    const ctxCara = await ctxFor(db, cara.id, ws1.slug);
    await expect(discardCapture(ctxCara, capture.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("notifications", () => {
  it("notifies the assignee in-app, never the actor", async () => {
    const ctxA = await ctxFor(db, anna.id, ws1.slug);
    const [project] = await listProjects(ctxA);
    await createTask(ctxA, {
      projectId: project.id,
      title: "For Cara",
      description: "",
      status: "todo",
      priority: "none",
      assigneeId: cara.id,
      labelIds: [],
    });

    const caraInbox = await listNotifications(db, cara.id);
    expect(caraInbox.some((n) => n.type === "task_assigned")).toBe(true);
    const annaInbox = await listNotifications(db, anna.id);
    expect(annaInbox.filter((n) => n.type === "task_assigned")).toHaveLength(0);

    const before = await unreadCount(db, cara.id);
    expect(before).toBeGreaterThan(0);
    await markRead(db, cara.id, "all");
    expect(await unreadCount(db, cara.id)).toBe(0);
  });
});

describe("POPIA rights", () => {
  it("exports a user's data and blocks deleting an owner with team members", async () => {
    const data = await exportUserData(db, anna.id);
    expect(data.user.email).toBe(anna.email);
    expect(data.memberships.length).toBeGreaterThan(0);

    await expect(deleteAccount(db, anna.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("deletes a sole-owner account together with their workspace", async () => {
    await deleteAccount(db, ben.id);
    const gone = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, ben.id));
    expect(gone).toHaveLength(0);
    const wsGone = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, ws2.id));
    expect(wsGone).toHaveLength(0);
  });
});

describe("starter template", () => {
  it("seeds a realistic project with labels, tasks and activity", async () => {
    const zoe = await createTestUser(db, "zoe@fresh.co.za", "Zoe");
    const ws = await createWorkspace(db, zoe.id, { name: "Fresh Agency", seedStarter: true });
    const ctx = await ctxFor(db, zoe.id, ws.slug);

    const projects = await listProjects(ctx);
    expect(projects).toHaveLength(1);
    expect(projects[0].clientName).toBe("Karoo Coffee Co.");

    const board = await boardTasks(ctx, projects[0].id);
    expect(board.length).toBeGreaterThanOrEqual(8);
    expect(board.some((t) => t.status === "done" && t.completedAt)).toBe(true);
    expect(board.some((t) => t.labels.length > 0)).toBe(true);

    const mine = await myWork(ctx);
    expect(mine.length).toBeGreaterThan(0);

    const usage = await workspaceUsage(ctx);
    expect(usage.activeProjects).toBe(1);
    expect(usage.members).toBe(1);
  });
});
