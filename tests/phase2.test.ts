/**
 * Phase 2 (scorecards + time tracking): Studio gating, period alignment,
 * timer lifecycle, and the same cross-tenant walls as everything else.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { createWorkspace } from "@/server/dal/workspaces";
import { createProject } from "@/server/dal/projects";
import { createTask } from "@/server/dal/tasks";
import {
  createScorecard,
  listScorecards,
  periodStartFor,
  upsertScorecardEntry,
} from "@/server/dal/scorecards";
import {
  logTime,
  runningTimer,
  startTimer,
  stopTimer,
  taskTime,
  weekTime,
} from "@/server/dal/time";
import { LimitError, NotFoundError, ValidationError } from "@/server/dal/errors";
import { todaySAST, weekStart } from "@/lib/dates";
import { createTestDb, createTestUser, ctxFor } from "./helpers/db";

let db: Db;
let om: { id: string };
let rival: { id: string };
let studioWs: { id: string; slug: string };
let freeWs: { id: string; slug: string };
let taskA: string;
let taskB: string;

beforeAll(async () => {
  db = await createTestDb();
  om = await createTestUser(db, "om@studio.co.za", "Om");
  rival = await createTestUser(db, "rival@other.co.za", "Rival");
  studioWs = await createWorkspace(db, om.id, { name: "Studio Co", seedStarter: false });
  freeWs = await createWorkspace(db, rival.id, { name: "Free Co", seedStarter: false });
  await db
    .update(schema.workspaces)
    .set({ plan: "studio" })
    .where(eq(schema.workspaces.id, studioWs.id));

  const ctx = await ctxFor(db, om.id, studioWs.slug);
  const project = await createProject(ctx, { name: "Retainer", color: "#17685C" });
  const base = {
    description: "",
    status: "todo" as const,
    priority: "none" as const,
    labelIds: [],
  };
  taskA = (await createTask(ctx, { ...base, projectId: project.id, title: "Design pass" })).id;
  taskB = (await createTask(ctx, { ...base, projectId: project.id, title: "Copy review" })).id;
});

describe("plan gating", () => {
  it("free plans hit the friendly feature limit, naming the right plan", async () => {
    const ctx = await ctxFor(db, rival.id, freeWs.slug);
    await expect(
      createScorecard(ctx, { name: "New business", unit: "count", period: "weekly" }),
    ).rejects.toMatchObject({
      code: "plan_limit",
      limit: "feature",
      feature: "scorecards",
      message: expect.stringContaining("Team plan"),
    });
    await expect(startTimer(ctx, taskA)).rejects.toMatchObject({
      feature: "time_tracking",
      message: expect.stringContaining("Studio plan"),
    });
  });

  it("Team gets scorecards but not time tracking", async () => {
    const boss = await createTestUser(db, "boss@team.co.za", "Boss");
    const teamWs = await createWorkspace(db, boss.id, {
      name: "Team Band Co",
      seedStarter: false,
    });
    await db
      .update(schema.workspaces)
      .set({ plan: "team" })
      .where(eq(schema.workspaces.id, teamWs.id));
    const ctx = await ctxFor(db, boss.id, teamWs.slug);

    const card = await createScorecard(ctx, {
      name: "Invoices sent",
      unit: "count",
      period: "monthly",
    });
    expect(card.id).toBeTruthy();

    const project = await createProject(ctx, { name: "P", color: "#17685C" });
    const task = await createTask(ctx, {
      projectId: project.id,
      title: "T",
      description: "",
      status: "todo",
      priority: "none",
      labelIds: [],
    });
    await expect(startTimer(ctx, task.id)).rejects.toBeInstanceOf(LimitError);
  });
});

describe("scorecards", () => {
  it("aligns periods: weekly to Monday, monthly to the 1st", () => {
    expect(periodStartFor("weekly", "2026-07-17")).toBe(weekStart("2026-07-17"));
    expect(periodStartFor("monthly", "2026-07-17")).toBe("2026-07-01");
  });

  it("creates, upserts (idempotently), and lists with history", async () => {
    const ctx = await ctxFor(db, om.id, studioWs.slug);
    const card = await createScorecard(ctx, {
      name: "New business calls",
      unit: "count",
      target: 10,
      period: "weekly",
    });
    const current = periodStartFor("weekly", todaySAST());
    expect(card.currentPeriodStart).toBe(current);

    await upsertScorecardEntry(ctx, card.id, { periodStart: current, value: 7 });
    await upsertScorecardEntry(ctx, card.id, { periodStart: current, value: 9 });

    const [listed] = await listScorecards(ctx);
    expect(listed.entries).toEqual([{ periodStart: current, value: 9 }]);

    // Misaligned and future periods are rejected.
    await expect(
      upsertScorecardEntry(ctx, card.id, {
        periodStart: "2026-07-16", // a Thursday
        value: 1,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      upsertScorecardEntry(ctx, card.id, {
        periodStart: weekStart("2027-01-11"),
        value: 1,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("keeps scorecards behind the tenant wall (even for paid rivals)", async () => {
    const mine = await ctxFor(db, om.id, studioWs.slug);
    const [card] = await listScorecards(mine);

    // On free the feature gate fires first; flip the rival to Studio so the
    // failure we observe is the wall itself.
    await db
      .update(schema.workspaces)
      .set({ plan: "studio" })
      .where(eq(schema.workspaces.id, freeWs.id));
    const paidRival = await ctxFor(db, rival.id, freeWs.slug);
    await expect(
      upsertScorecardEntry(paidRival, card.id, {
        periodStart: periodStartFor("weekly", todaySAST()),
        value: 999,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await db
      .update(schema.workspaces)
      .set({ plan: "free" })
      .where(eq(schema.workspaces.id, freeWs.id));
  });
});

describe("time tracking", () => {
  it("one running timer per person; switching tasks stops the old one", async () => {
    const ctx = await ctxFor(db, om.id, studioWs.slug);

    await startTimer(ctx, taskA);
    const runningA = await runningTimer(ctx);
    expect(runningA?.taskId).toBe(taskA);
    expect(runningA?.taskTitle).toBe("Design pass");

    // Starting on B closes A (with at least one whole minute logged).
    await startTimer(ctx, taskB);
    const runningB = await runningTimer(ctx);
    expect(runningB?.taskId).toBe(taskB);
    const aTime = await taskTime(ctx, taskA);
    expect(aTime.totalMinutes).toBeGreaterThanOrEqual(1);
    expect(aTime.running).toBeNull();

    const { minutes } = await stopTimer(ctx);
    expect(minutes).toBeGreaterThanOrEqual(1);
    expect(await runningTimer(ctx)).toBeNull();
    await expect(stopTimer(ctx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("manual logs add up and the week rolls up per member and project", async () => {
    const ctx = await ctxFor(db, om.id, studioWs.slug);
    await logTime(ctx, { taskId: taskA, minutes: 45, note: "concepting" });

    const aTime = await taskTime(ctx, taskA);
    expect(aTime.totalMinutes).toBeGreaterThanOrEqual(46); // 45 + timer's ≥1

    const week = await weekTime(ctx.db, ctx.workspace.id);
    expect(week.totalMinutes).toBe(
      aTime.totalMinutes + (await taskTime(ctx, taskB)).totalMinutes,
    );
    expect(week.byMember[0]?.user.id).toBe(om.id);
    expect(week.byProject[0]?.name).toBe("Retainer");
  });

  it("rejects timers on another tenant's task", async () => {
    const theirs = await ctxFor(db, rival.id, freeWs.slug);
    // Even on a paid plan this would 404; on free the gate fires first,
    // so flip the plan to prove the wall specifically.
    await db
      .update(schema.workspaces)
      .set({ plan: "studio" })
      .where(eq(schema.workspaces.id, freeWs.id));
    const paidTheirs = await ctxFor(db, rival.id, freeWs.slug);
    await expect(startTimer(paidTheirs, taskA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(taskTime(paidTheirs, taskA)).rejects.toBeInstanceOf(NotFoundError);
    // Restore for any later assertions.
    await db
      .update(schema.workspaces)
      .set({ plan: "free" })
      .where(eq(schema.workspaces.id, freeWs.id));
    void theirs;
  });
});
