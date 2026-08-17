/**
 * Account and workspace deletion actually completing, and taking the stored
 * files with them.
 *
 * Two bugs are pinned here, both of which shipped and both of which would have
 * failed an app store review:
 *
 *   1. deleteAccount() ended in `DELETE FROM users` while seven columns
 *      referenced users.id NOT NULL with no ON DELETE clause. Postgres refused
 *      the delete for anyone who had ever created a task or written a comment
 *      in a workspace that outlived them, which is nearly every real member.
 *
 *   2. Neither deletion path removed anything from Supabase storage. The
 *      cascade took the rows that held the storage paths, stranding every
 *      attachment and meeting recording in the bucket permanently, with
 *      nothing left that could name them again.
 *
 * The subtle one is the third test below: an inner join from comments to users
 * makes a null-authored comment disappear from the thread entirely, which
 * loses the team's discussion rather than just the name against it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db";
import { addMember, createTestDb, createTestUser, ctxFor } from "./helpers/db";

/** Paths handed to storage for deletion, in call order. */
const purged: string[] = [];

vi.mock("@/server/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/storage")>();
  return {
    ...actual,
    deleteObject: async () => undefined,
    deleteObjects: async (paths: readonly string[]) => {
      purged.push(...paths);
    },
  };
});

// Imported after the mock so the DAL binds to the stub.
const { deleteAccount } = await import("@/server/dal/account");
const { deleteWorkspace } = await import("@/server/dal/workspaces");
const { taskDetail } = await import("@/server/dal/tasks");

/**
 * A workspace with an owner and a member, where the MEMBER has created the
 * project, the task and the comment. That is the shape that used to make the
 * member undeletable.
 */
async function scenario(db: Db) {
  const owner = await createTestUser(db, "owner@test.local", "Owner");
  const member = await createTestUser(db, "member@test.local", "Naledi");

  const [ws] = await db
    .insert(schema.workspaces)
    .values({ name: "Studio", slug: "studio", createdBy: owner.id })
    .returning();
  await addMember(db, ws.id, owner.id, "owner");
  await addMember(db, ws.id, member.id, "member");

  const [project] = await db
    .insert(schema.projects)
    .values({ workspaceId: ws.id, name: "Rebrand", createdBy: member.id })
    .returning();

  const [task] = await db
    .insert(schema.tasks)
    .values({
      workspaceId: ws.id,
      projectId: project.id,
      title: "Ship the logo",
      createdBy: member.id,
    })
    .returning();

  await db.insert(schema.comments).values({
    workspaceId: ws.id,
    taskId: task.id,
    authorId: member.id,
    body: "Sent to the printer",
  });

  return { owner, member, ws, project, task };
}

describe("deleteAccount", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    purged.length = 0;
  });

  it("succeeds for a member who authored a task and a comment", async () => {
    const { member } = await scenario(db);
    // Before the fix this threw a foreign key violation.
    await expect(deleteAccount(db, member.id)).resolves.toBeUndefined();

    const left = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, member.id));
    expect(left).toHaveLength(0);
  });

  it("keeps their work and drops only the attribution", async () => {
    const { member, task } = await scenario(db);
    await deleteAccount(db, member.id);

    const [comment] = await db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.taskId, task.id));
    expect(comment).toBeDefined();
    expect(comment.body).toBe("Sent to the printer");
    expect(comment.authorId).toBeNull();

    const [kept] = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, task.id));
    expect(kept.title).toBe("Ship the logo");
    expect(kept.createdBy).toBeNull();
  });

  it("still shows the comment in the thread, unattributed", async () => {
    const { owner, member, ws, task } = await scenario(db);
    await deleteAccount(db, member.id);

    // The regression guard: an inner join here returns zero comments and the
    // discussion silently vanishes for everyone left in the workspace.
    const ctx = await ctxFor(db, owner.id, ws.slug);
    const detail = await taskDetail(ctx, task.id);
    expect(detail.comments).toHaveLength(1);
    expect(detail.comments[0].body).toBe("Sent to the printer");
    expect(detail.comments[0].author).toBeNull();
  });

  it("revokes the unaccepted invites they issued", async () => {
    const { member, ws } = await scenario(db);
    // A reusable link carrying the admin role: the escalation path is to mint
    // one, delete the account, sign up again on the same address and rejoin as
    // admin. Deletion used to be impossible, which is the only thing that had
    // been holding this shut.
    await db.insert(schema.invites).values({
      workspaceId: ws.id,
      email: null,
      role: "admin",
      token: "live-link-token",
      invitedBy: member.id,
      expiresAt: new Date(Date.now() + 90 * 864e5),
    });
    // An already-accepted one stays: it is the record of how a current member
    // got in, and its token is spent.
    await db.insert(schema.invites).values({
      workspaceId: ws.id,
      email: "someone@test.local",
      role: "member",
      token: "spent-token",
      invitedBy: member.id,
      expiresAt: new Date(Date.now() + 90 * 864e5),
      acceptedAt: new Date(),
    });

    await deleteAccount(db, member.id);

    const left = await db.select().from(schema.invites);
    expect(left.map((i) => i.token)).toEqual(["spent-token"]);
  });

  it("replays an offline comment whose author has since gone", async () => {
    const { owner, member, ws, task } = await scenario(db);
    const [orphan] = await db
      .insert(schema.comments)
      .values({
        workspaceId: ws.id,
        taskId: task.id,
        authorId: member.id,
        body: "Queued while offline",
      })
      .returning();

    await deleteAccount(db, member.id);

    // The offline outbox retries with the same client-generated id. An inner
    // join in appendComment turns "already synced" into "no such comment",
    // and the queued write fails forever.
    const { addComment } = await import("@/server/dal/comments");
    const ctx = await ctxFor(db, owner.id, ws.slug);
    const replayed = await addComment(ctx, task.id, {
      id: orphan.id,
      body: "Queued while offline",
    });
    expect(replayed.body).toBe("Queued while offline");
    expect(replayed.author).toBeNull();
  });

  it("refuses while they still own a workspace with other members", async () => {
    const { owner } = await scenario(db);
    await expect(deleteAccount(db, owner.id)).rejects.toThrow(/hand over ownership/i);

    const [still] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, owner.id));
    expect(still).toBeDefined();
  });

  it("purges recordings the user made, even in a workspace that survives", async () => {
    const { member, ws } = await scenario(db);
    await db.insert(schema.meetings).values({
      workspaceId: ws.id,
      createdBy: member.id,
      title: "Client call",
      audioPath: "meetings/client-call.opus",
    });

    await deleteAccount(db, member.id);

    // meetings.created_by CASCADEs, so the row goes even though the workspace
    // lives on. Without the purge the audio would outlive every reference.
    expect(purged).toContain("meetings/client-call.opus");
    const rows = await db.select().from(schema.meetings);
    expect(rows).toHaveLength(0);
  });

  it("purges files inside a workspace that dies with the account", async () => {
    const solo = await createTestUser(db, "solo@test.local", "Solo");
    const [ws] = await db
      .insert(schema.workspaces)
      .values({ name: "Solo", slug: "solo", createdBy: solo.id })
      .returning();
    await addMember(db, ws.id, solo.id, "owner");
    const [project] = await db
      .insert(schema.projects)
      .values({ workspaceId: ws.id, name: "P", createdBy: solo.id })
      .returning();
    const [task] = await db
      .insert(schema.tasks)
      .values({
        workspaceId: ws.id,
        projectId: project.id,
        title: "T",
        createdBy: solo.id,
      })
      .returning();
    await db.insert(schema.attachments).values({
      workspaceId: ws.id,
      taskId: task.id,
      uploaderId: solo.id,
      name: "brief.pdf",
      mime: "application/pdf",
      sizeBytes: 10,
      storagePath: "att/brief.pdf",
    });

    await deleteAccount(db, solo.id);

    expect(purged).toContain("att/brief.pdf");
    const left = await db.select().from(schema.workspaces);
    expect(left).toHaveLength(0);
  });
});

describe("deleteWorkspace", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    purged.length = 0;
  });

  it("purges every attachment and recording it held", async () => {
    const { owner, ws, task } = await scenario(db);
    await db.insert(schema.attachments).values({
      workspaceId: ws.id,
      taskId: task.id,
      uploaderId: owner.id,
      name: "spec.pdf",
      mime: "application/pdf",
      sizeBytes: 20,
      storagePath: "att/spec.pdf",
    });
    await db.insert(schema.meetings).values({
      workspaceId: ws.id,
      createdBy: owner.id,
      title: "Kickoff",
      audioPath: "meetings/kickoff.opus",
    });

    const ctx = await ctxFor(db, owner.id, ws.slug);
    await deleteWorkspace(ctx);

    expect(purged).toEqual(
      expect.arrayContaining(["att/spec.pdf", "meetings/kickoff.opus"]),
    );
    expect(await db.select().from(schema.workspaces)).toHaveLength(0);
  });

  it("does not try to delete a meeting that has no audio", async () => {
    const { owner, ws } = await scenario(db);
    await db.insert(schema.meetings).values({
      workspaceId: ws.id,
      createdBy: owner.id,
      title: "Notes only",
      audioPath: null,
    });

    const ctx = await ctxFor(db, owner.id, ws.slug);
    await deleteWorkspace(ctx);

    expect(purged).not.toContain(null);
    expect(purged.every((p) => typeof p === "string" && p.length > 0)).toBe(true);
  });
});
