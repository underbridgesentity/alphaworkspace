/**
 * Tests for the enhancement batch: recurrence date maths + spawn-on-complete,
 * @mention matching, transcription keyterms, and invite-link accept.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { nextOccurrence } from "@/lib/dates";
import { matchMentions } from "@/lib/mentions";
import { keytermsFrom } from "@/server/ai/transcribe";
import { createWorkspace, acceptInvite, createInviteLink } from "@/server/dal/workspaces";
import { createProject, listProjects } from "@/server/dal/projects";
import { createTask, boardTasks, updateTask } from "@/server/dal/tasks";
import { addComment } from "@/server/dal/comments";
import { listNotifications } from "@/server/dal/notifications";
import { addMember, createTestDb, createTestUser, ctxFor } from "./helpers/db";

describe("nextOccurrence", () => {
  it("advances daily/weekly/monthly with month-end clamping", () => {
    expect(nextOccurrence("2026-07-16", "daily")).toBe("2026-07-17");
    expect(nextOccurrence("2026-07-16", "weekly")).toBe("2026-07-23");
    expect(nextOccurrence("2026-07-16", "monthly")).toBe("2026-08-16");
    // 31 Jan → Feb clamps to the 28th.
    expect(nextOccurrence("2027-01-31", "monthly")).toBe("2027-02-28");
    expect(nextOccurrence("2026-07-16", "weekly", 2)).toBe("2026-07-30");
  });
});

describe("matchMentions", () => {
  const members = [
    { id: "u1", name: "Thabo Nkosi", email: "thabo@x.co.za" },
    { id: "u2", name: "Naledi Dlamini", email: "naledi@x.co.za" },
    { id: "u3", name: "Thabo Molefe", email: "tmolefe@x.co.za" },
  ];
  it("matches @First and @Full Name, dedupes, ignores non-mentions", () => {
    expect(matchMentions("hey @Naledi can you check", members).map((m) => m.id)).toEqual(["u2"]);
    expect(matchMentions("@Thabo Nkosi please", members).map((m) => m.id)).toEqual(["u1"]);
    expect(matchMentions("email me at thabo@x.co.za", members)).toHaveLength(0);
    const two = matchMentions("@Naledi and @Thabo Nkosi", members).map((m) => m.id).sort();
    expect(two).toEqual(["u1", "u2"]);
  });
});

describe("keytermsFrom", () => {
  it("builds a deduped vocabulary of names, first names, clients, labels", () => {
    const terms = keytermsFrom({
      members: [{ name: "Naledi Dlamini", email: "naledi@x.co.za" }],
      projects: [{ name: "Liberty rebrand", clientName: "Liberty" }],
      labels: [{ name: "Design" }],
    });
    expect(terms).toContain("Naledi Dlamini");
    expect(terms).toContain("Naledi");
    expect(terms).toContain("Liberty rebrand");
    expect(terms).toContain("Design");
    // Liberty appears as both project token and client — deduped.
    expect(terms.filter((t) => t === "Liberty")).toHaveLength(1);
  });
});

describe("recurring tasks (DAL)", () => {
  let db: Db;
  let owner: { id: string };
  let ws: { id: string; slug: string };
  let projectId: string;

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createTestUser(db, "own@r.co.za", "Owner");
    ws = await createWorkspace(db, owner.id, { name: "Rec Co", seedStarter: false });
    const ctx = await ctxFor(db, owner.id, ws.slug);
    projectId = (await createProject(ctx, { name: "Retainer", color: "#5B7C99" })).id;
  });

  it("spawns the next occurrence on completion, once", async () => {
    const ctx = await ctxFor(db, owner.id, ws.slug);
    const task = await createTask(ctx, {
      projectId,
      title: "Monthly report",
      description: "",
      status: "todo",
      priority: "med",
      assigneeId: owner.id,
      dueDate: "2026-07-31",
      recurrence: { freq: "monthly" },
      labelIds: [],
    });

    await updateTask(ctx, task.id, { status: "done" });
    let board = await boardTasks(ctx, projectId);
    const spawned = board.filter((t) => t.title === "Monthly report" && t.status !== "done");
    expect(spawned).toHaveLength(1);
    expect(spawned[0].dueDate).toBe("2026-08-31");
    expect(spawned[0].recurrence?.freq).toBe("monthly");

    // Re-completing (idempotent replay) doesn't double-spawn.
    await updateTask(ctx, task.id, { status: "done" });
    board = await boardTasks(ctx, projectId);
    expect(
      board.filter((t) => t.title === "Monthly report" && t.dueDate === "2026-08-31"),
    ).toHaveLength(1);
  });

  it("non-recurring tasks don't spawn", async () => {
    const ctx = await ctxFor(db, owner.id, ws.slug);
    const t = await createTask(ctx, {
      projectId,
      title: "One off",
      description: "",
      status: "todo",
      priority: "none",
      labelIds: [],
    });
    await updateTask(ctx, t.id, { status: "done" });
    const board = await boardTasks(ctx, projectId);
    expect(board.filter((x) => x.title === "One off")).toHaveLength(1);
  });
});

describe("@mention notifications + invite links (DAL)", () => {
  it("notifies mentioned members, not just assignee/creator", async () => {
    const db = await createTestDb();
    const anna = await createTestUser(db, "anna@m.co.za", "Anna");
    const ben = await createTestUser(db, "ben@m.co.za", "Ben Khumalo");
    const ws = await createWorkspace(db, anna.id, { name: "Mentions", seedStarter: false });
    await addMember(db, ws.id, ben.id, "member");
    const ctx = await ctxFor(db, anna.id, ws.slug);
    const project = await createProject(ctx, { name: "P", color: "#5B7C99" });
    const task = await createTask(ctx, {
      projectId: project.id,
      title: "T",
      description: "",
      status: "todo",
      priority: "none",
      assigneeId: anna.id,
      labelIds: [],
    });

    await addComment(ctx, task.id, { body: "hey @Ben can you review this" });
    const benInbox = await listNotifications(db, ben.id);
    expect(benInbox.some((n) => n.type === "mentioned")).toBe(true);
  });

  it("shareable link lets anyone join and stays reusable", async () => {
    const db = await createTestDb();
    const admin = await createTestUser(db, "admin@l.co.za", "Admin");
    const ws = await createWorkspace(db, admin.id, { name: "Linkable", seedStarter: false });
    const ctx = await ctxFor(db, admin.id, ws.slug);
    const { token } = await createInviteLink(ctx, "member");

    const joiner1 = await createTestUser(db, "j1@l.co.za", "J1");
    const joiner2 = await createTestUser(db, "j2@l.co.za", "J2");
    await acceptInvite(db, joiner1, token);
    await acceptInvite(db, joiner2, token); // same link, still valid

    const members = await listProjects(ctx); // just ensure ctx still resolves
    expect(members).toBeDefined();
    const rows = await db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.workspaceId, ws.id));
    expect(rows).toHaveLength(3); // admin + 2 joiners
  });
});
