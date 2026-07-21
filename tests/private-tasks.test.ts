/**
 * Private tasks: the owner-only wall (teammates AND admins blocked,
 * indistinguishable from non-existence), the promote door that turns a
 * private item into an ordinary team task, and POPIA export inclusion.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { createWorkspace } from "@/server/dal/workspaces";
import { createProject } from "@/server/dal/projects";
import { taskDetail } from "@/server/dal/tasks";
import {
  createPrivateTask,
  deletePrivateTask,
  listPrivateTasks,
  promotePrivateTask,
  updatePrivateTask,
} from "@/server/dal/private-tasks";
import { exportUserData } from "@/server/dal/account";
import { NotFoundError } from "@/server/dal/errors";
import { addMember, createTestDb, createTestUser, ctxFor } from "./helpers/db";

let db: Db;
let owner: { id: string };
let admin: { id: string };
let member: { id: string };
let outsider: { id: string };
let ws: { id: string; slug: string };
let otherWs: { id: string; slug: string };
let projectId: string;

beforeAll(async () => {
  db = await createTestDb();
  owner = await createTestUser(db, "owner@list.co.za", "Owner");
  admin = await createTestUser(db, "admin@list.co.za", "Adele");
  member = await createTestUser(db, "member@list.co.za", "Naledi");
  outsider = await createTestUser(db, "out@side.co.za", "Out");
  ws = await createWorkspace(db, owner.id, { name: "List Co", seedStarter: false });
  otherWs = await createWorkspace(db, outsider.id, {
    name: "Elsewhere",
    seedStarter: false,
  });
  await addMember(db, ws.id, admin.id, "admin");
  await addMember(db, ws.id, member.id, "member");
  const ctx = await ctxFor(db, owner.id, ws.slug);
  projectId = (await createProject(ctx, { name: "Launch", color: "#17685C" })).id;
});

describe("owner-only wall", () => {
  it("hides a member's private items from everyone else, admins included", async () => {
    const mine = await ctxFor(db, member.id, ws.slug);
    const item = await createPrivateTask(mine, {
      title: "Ask for a raise",
      note: "before the review",
    });

    // Owner of the item sees it; the workspace owner and admin see NOTHING.
    expect((await listPrivateTasks(mine)).map((t) => t.id)).toContain(item.id);
    const ownerCtx = await ctxFor(db, owner.id, ws.slug);
    const adminCtx = await ctxFor(db, admin.id, ws.slug);
    expect(await listPrivateTasks(ownerCtx)).toHaveLength(0);
    expect(await listPrivateTasks(adminCtx)).toHaveLength(0);

    // Mutations by anyone else miss indistinguishably.
    await expect(
      updatePrivateTask(adminCtx, item.id, { title: "seen" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deletePrivateTask(ownerCtx, item.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      promotePrivateTask(adminCtx, item.id, { projectId }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Cross-workspace: the id doesn't exist over there either.
    const outCtx = await ctxFor(db, outsider.id, otherWs.slug);
    await expect(
      updatePrivateTask(outCtx, item.id, { title: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // And the row is untouched.
    const [row] = await db
      .select()
      .from(schema.privateTasks)
      .where(eq(schema.privateTasks.id, item.id));
    expect(row.title).toBe("Ask for a raise");
  });

  /**
   * The offline-replay create path must stay onConflictDoNothing: replaying
   * an id someone else owns reads nothing and, crucially, OVERWRITES
   * nothing. Pins that so a refactor to an upsert can't turn the replay
   * into a cross-user write.
   */
  it("a colliding client-supplied id neither reads nor overwrites", async () => {
    const mine = await ctxFor(db, member.id, ws.slug);
    const item = await createPrivateTask(mine, { title: "Mine alone", note: "" });

    const adminCtx = await ctxFor(db, admin.id, ws.slug);
    await expect(
      createPrivateTask(adminCtx, { id: item.id, title: "pwned", note: "" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const [row] = await db
      .select()
      .from(schema.privateTasks)
      .where(eq(schema.privateTasks.id, item.id));
    expect(row.title).toBe("Mine alone");
    expect(row.userId).toBe(member.id);
    await deletePrivateTask(mine, item.id);
  });

  it("toggles done and edits fields for the owner", async () => {
    const mine = await ctxFor(db, member.id, ws.slug);
    const item = await createPrivateTask(mine, { title: "Gym", note: "" });

    const done = await updatePrivateTask(mine, item.id, { done: true });
    expect(done.completedAt).not.toBeNull();
    const reopened = await updatePrivateTask(mine, item.id, {
      done: false,
      dueDate: "2026-07-25",
    });
    expect(reopened.completedAt).toBeNull();
    expect(reopened.dueDate).toBe("2026-07-25");
    await deletePrivateTask(mine, item.id);
  });

  it("writes no activity for private items", async () => {
    const before = await db
      .select()
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.workspaceId, ws.id));
    const mine = await ctxFor(db, member.id, ws.slug);
    const item = await createPrivateTask(mine, { title: "Quiet", note: "" });
    await updatePrivateTask(mine, item.id, { done: true });
    await deletePrivateTask(mine, item.id);
    const after = await db
      .select()
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.workspaceId, ws.id));
    expect(after.length).toBe(before.length);
  });
});

describe("promotion (the one door out)", () => {
  it("creates a real team task and removes the private row", async () => {
    const mine = await ctxFor(db, member.id, ws.slug);
    const item = await createPrivateTask(mine, {
      title: "Draft the launch email",
      note: "hit the deadline angle",
      dueDate: "2026-07-24",
    });

    const task = await promotePrivateTask(mine, item.id, { projectId });
    expect(task.projectId).toBe(projectId);
    expect(task.title).toBe("Draft the launch email");
    expect(task.description).toBe("hit the deadline angle");
    expect(task.dueDate).toBe("2026-07-24");
    expect(task.assigneeId).toBe(member.id); // defaults to the promoter

    // Now ordinary and team-visible: the admin can read it.
    const adminCtx = await ctxFor(db, admin.id, ws.slug);
    expect((await taskDetail(adminCtx, task.id)).task.id).toBe(task.id);

    // The private row is gone.
    expect((await listPrivateTasks(mine)).map((t) => t.id)).not.toContain(item.id);
  });

  it("refuses promotion into another workspace's project", async () => {
    const mine = await ctxFor(db, member.id, ws.slug);
    const outCtx = await ctxFor(db, outsider.id, otherWs.slug);
    const foreign = await createProject(outCtx, { name: "Theirs", color: "#5B7C99" });
    const item = await createPrivateTask(mine, { title: "Stays private", note: "" });

    await expect(
      promotePrivateTask(mine, item.id, { projectId: foreign.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // Still on the private list, untouched.
    expect((await listPrivateTasks(mine)).map((t) => t.id)).toContain(item.id);
  });
});

describe("POPIA export", () => {
  it("includes the user's private tasks", async () => {
    const mine = await ctxFor(db, member.id, ws.slug);
    await createPrivateTask(mine, { title: "Export me", note: "" });
    const data = await exportUserData(db, member.id);
    expect(
      (data.privateTasks as { title: string }[]).map((t) => t.title),
    ).toContain("Export me");
  });
});
