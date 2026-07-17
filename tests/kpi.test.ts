/**
 * KPI engine tests against PGlite: metric formulas, staleness settings,
 * week bucketing, member load, the weekly summary compile — and that no
 * other tenant's data ever leaks into any of it.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { createWorkspace } from "@/server/dal/workspaces";
import { createProject } from "@/server/dal/projects";
import { createTask, updateTask } from "@/server/dal/tasks";
import {
  briefItemsForUser,
  compileWeeklySummary,
  projectKpis,
  workspaceKpis,
} from "@/server/kpi";
import { addMember, createTestDb, createTestUser, ctxFor } from "./helpers/db";

// Fixed clock: Thursday 2026-07-16 08:00 SAST. Week = Mon 2026-07-13.
const NOW = new Date("2026-07-16T08:00:00+02:00");
const TODAY = "2026-07-16";
const WEEK_START = "2026-07-13";

let db: Db;
let owner: { id: string; email: string };
let thabo: { id: string; email: string };
let naledi: { id: string; email: string };
let ws: { id: string; slug: string };
let projectA: string;
let projectB: string;

async function setTask(
  taskId: string,
  patch: Partial<{
    createdAt: Date;
    completedAt: Date | null;
    lastActivityAt: Date;
    dueDate: string | null;
  }>,
) {
  await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, taskId));
}

/** Move every activity event of a task to a timestamp (bucketing tests). */
async function setEventTime(taskId: string, type: string, at: Date) {
  await db
    .update(schema.activityEvents)
    .set({ createdAt: at })
    .where(eq(schema.activityEvents.taskId, taskId));
  void type;
}

beforeAll(async () => {
  db = await createTestDb();
  owner = await createTestUser(db, "lead@agency.co.za", "Lerato Lead");
  thabo = await createTestUser(db, "thabo@agency.co.za", "Thabo Nkosi");
  naledi = await createTestUser(db, "naledi@agency.co.za", "Naledi Dlamini");
  ws = await createWorkspace(db, owner.id, { name: "Agency", seedStarter: false });
  await addMember(db, ws.id, thabo.id, "member");
  await addMember(db, ws.id, naledi.id, "member");

  const ctx = await ctxFor(db, owner.id, ws.slug);
  projectA = (await createProject(ctx, { name: "Liberty rebrand", color: "#5B7C99", clientName: "Liberty" })).id;
  projectB = (await createProject(ctx, { name: "Vodacom retainer", color: "#6FAE87", clientName: "Vodacom" })).id;

  const mk = (projectId: string, title: string, assigneeId?: string, dueDate?: string | null) =>
    createTask(ctx, {
      projectId,
      title,
      description: "",
      status: "todo",
      priority: "none",
      assigneeId: assigneeId ?? null,
      dueDate: dueDate ?? null,
      labelIds: [],
    });

  // Completed this week (Tue): 1-day cycle, by Thabo's assignment.
  const done1 = await mk(projectA, "Moodboard", thabo.id);
  await updateTask(ctx, done1.id, { status: "done" });
  await setTask(done1.id, {
    createdAt: new Date("2026-07-13T09:00:00+02:00"),
    completedAt: new Date("2026-07-14T09:00:00+02:00"),
  });
  await setEventTime(done1.id, "task_completed", new Date("2026-07-14T09:05:00+02:00"));

  // Completed this week (Wed): 3-day cycle.
  const done2 = await mk(projectB, "July content plan", owner.id);
  await updateTask(ctx, done2.id, { status: "done" });
  await setTask(done2.id, {
    createdAt: new Date("2026-07-12T10:00:00+02:00"),
    completedAt: new Date("2026-07-15T10:00:00+02:00"),
  });
  await setEventTime(done2.id, "task_completed", new Date("2026-07-15T10:05:00+02:00"));

  // Completed LAST week — must land in the previous throughput bucket and
  // stay out of this week's cycle-time average.
  const doneOld = await mk(projectB, "June wrap report", owner.id);
  await updateTask(ctx, doneOld.id, { status: "done" });
  await setTask(doneOld.id, {
    createdAt: new Date("2026-07-06T12:00:00+02:00"),
    completedAt: new Date("2026-07-08T12:00:00+02:00"),
  });
  await setEventTime(doneOld.id, "task_completed", new Date("2026-07-08T12:00:00+02:00"));

  // Overdue open task (Thabo).
  const overdue = await mk(projectA, "Client review deck", thabo.id, "2026-07-14");
  await setTask(overdue.id, { lastActivityAt: new Date("2026-07-15T08:00:00+02:00") });

  // Stale open task: last touched 6 days ago (default staleDays 5).
  const stale = await mk(projectA, "Forgotten banner", naledi.id, null);
  await setTask(stale.id, { lastActivityAt: new Date("2026-07-10T08:00:00+02:00") });

  // Fresh open tasks.
  await mk(projectB, "Social batch", thabo.id, "2026-07-20");
  await mk(projectB, "Retainer report", naledi.id, TODAY);
});

describe("workspaceKpis", () => {
  it("computes the headline numbers exactly", async () => {
    const kpis = await workspaceKpis(db, ws.id, { now: NOW });

    expect(kpis.completedThisWeek).toBe(2); // doneOld is last week
    expect(kpis.openNow).toBe(4);
    expect(kpis.overdueNow).toBe(1);
    expect(kpis.staleNow).toBe(1);
    // 2 done / (2 done + 4 open) = 33%
    expect(kpis.completionRatePct).toBe(33);
    // (1d + 3d) / 2
    expect(kpis.avgCycleTimeDays).toBeCloseTo(2.0, 1);
  });

  it("buckets throughput into SAST weeks (Mondays)", async () => {
    const kpis = await workspaceKpis(db, ws.id, { now: NOW });
    expect(kpis.throughputByWeek).toHaveLength(8);
    const byWeek = Object.fromEntries(
      kpis.throughputByWeek.map((w) => [w.weekStart, w.completed]),
    );
    expect(byWeek[WEEK_START]).toBe(2);
    expect(byWeek["2026-07-06"]).toBe(1);
    for (const w of kpis.throughputByWeek) {
      // Every bucket key is a Monday.
      expect(new Date(`${w.weekStart}T12:00:00+02:00`).getUTCDay()).toBe(1);
    }
  });

  it("ranks member load with zero-load members included", async () => {
    const kpis = await workspaceKpis(db, ws.id, { now: NOW });
    expect(kpis.memberLoad).toHaveLength(3);
    expect(kpis.memberLoad[0].open).toBeGreaterThanOrEqual(
      kpis.memberLoad[1].open,
    );
    const thaboLoad = kpis.memberLoad.find((m) => m.user.id === thabo.id)!;
    expect(thaboLoad.open).toBe(2);
    expect(thaboLoad.overdue).toBe(1);
    const ownerLoad = kpis.memberLoad.find((m) => m.user.id === owner.id)!;
    expect(ownerLoad.open).toBe(0);
  });

  it("respects the workspace staleDays setting", async () => {
    await db
      .update(schema.workspaces)
      .set({ settings: { staleDays: 2 } })
      .where(eq(schema.workspaces.id, ws.id));
    const tight = await workspaceKpis(db, ws.id, { now: NOW });
    // With a 2-day window, the overdue task (touched 1d ago) is fresh but
    // both the stale one (6d) and anything older than 2d counts.
    expect(tight.staleNow).toBeGreaterThanOrEqual(1);

    await db
      .update(schema.workspaces)
      .set({ settings: { staleDays: 30 } })
      .where(eq(schema.workspaces.id, ws.id));
    const loose = await workspaceKpis(db, ws.id, { now: NOW });
    expect(loose.staleNow).toBe(0);

    await db
      .update(schema.workspaces)
      .set({ settings: {} })
      .where(eq(schema.workspaces.id, ws.id));
  });

  it("returns nulls, not fabrications, for an empty workspace", async () => {
    const zoe = await createTestUser(db, "zoe@empty.co.za", "Zoe");
    const empty = await createWorkspace(db, zoe.id, { name: "Empty", seedStarter: false });
    const kpis = await workspaceKpis(db, empty.id, { now: NOW });
    expect(kpis.completionRatePct).toBeNull();
    expect(kpis.avgCycleTimeDays).toBeNull();
    expect(kpis.openNow).toBe(0);
  });
});

describe("projectKpis", () => {
  it("scopes every number to the project", async () => {
    const a = await projectKpis(db, ws.id, projectA, { now: NOW });
    expect(a.completedThisWeek).toBe(1);
    expect(a.openNow).toBe(2);
    expect(a.overdueNow).toBe(1);
    const b = await projectKpis(db, ws.id, projectB, { now: NOW });
    expect(b.completedThisWeek).toBe(1);
    expect(b.overdueNow).toBe(0);
  });
});

describe("compileWeeklySummary", () => {
  it("builds the narrative's world view — names, projects, dueNext", async () => {
    const summary = await compileWeeklySummary(db, ws.id, WEEK_START, { now: NOW });

    expect(summary.workspaceName).toBe("Agency");
    expect(summary.weekEnd).toBe("2026-07-19");
    expect(summary.totals.completed).toBe(2);
    expect(summary.totals.activeProjects).toBe(2);

    // Members sorted by completions; actor of both completions is the owner
    // (they clicked done), names resolve.
    expect(summary.members[0].completed).toBeGreaterThanOrEqual(
      summary.members[1]?.completed ?? 0,
    );
    const names = summary.members.map((m) => m.name);
    expect(names).toContain("Thabo Nkosi");

    const liberty = summary.projects.find((p) => p.name === "Liberty rebrand")!;
    expect(liberty.overdue).toBe(1);
    expect(liberty.clientName).toBe("Liberty");

    const vodacom = summary.projects.find((p) => p.name === "Vodacom retainer")!;
    expect(vodacom.dueNext.length).toBeGreaterThan(0);
    expect(vodacom.dueNext[0].dueDate >= TODAY).toBe(true);
    expect(vodacom.dueNext.length).toBeLessThanOrEqual(3);
  });

  it("never leaks another tenant's data", async () => {
    const spy = await createTestUser(db, "spy@rival.co.za", "Rival");
    const rivalWs = await createWorkspace(db, spy.id, { name: "Rival Co", seedStarter: false });
    const rivalCtx = await ctxFor(db, spy.id, rivalWs.slug);
    const rivalProject = await createProject(rivalCtx, {
      name: "Secret Pitch Nandos",
      color: "#D9A13B",
      clientName: "Top Secret Client",
    });
    await createTask(rivalCtx, {
      projectId: rivalProject.id,
      title: "Confidential rival task",
      description: "",
      status: "todo",
      priority: "none",
      labelIds: [],
    });

    const summary = await compileWeeklySummary(db, ws.id, WEEK_START, { now: NOW });
    const blob = JSON.stringify(summary);
    expect(blob).not.toContain("Secret Pitch");
    expect(blob).not.toContain("Confidential rival task");
    expect(blob).not.toContain("Rival");
  });
});

describe("briefItemsForUser", () => {
  it("ranks overdue → due today and counts correctly", async () => {
    const brief = await briefItemsForUser(db, ws.id, thabo.id, { now: NOW });
    expect(brief.items[0].reason).toBe("overdue");
    expect(brief.items[0].title).toBe("Client review deck");
    expect(brief.overdueCount).toBe(1);
    // Thabo has no due-today tasks; naledi does.
    const naledisBrief = await briefItemsForUser(db, ws.id, naledi.id, { now: NOW });
    expect(naledisBrief.dueTodayCount).toBe(1);
    expect(
      naledisBrief.items.every((i) => !i.title.includes("Client review deck")),
    ).toBe(true);
  });
});
