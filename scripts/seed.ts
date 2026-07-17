/**
 * Seeds a demo agency workspace with three weeks of realistic history so the
 * dashboard, My Work and the weekly narrative have real signal on first open.
 *
 * Run: npm run seed   (needs DATABASE_URL; safe to re-run, it makes a fresh
 * uniquely-slugged workspace each time)
 *
 * Sign in afterwards with lerato@mzansi.studio (magic link prints to the dev
 * console when RESEND_API_KEY is unset).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import type { Db } from "../src/server/db";
import { createWorkspace } from "../src/server/dal/workspaces";
import { resolveCtx } from "../src/server/dal/context";
import { createProject } from "../src/server/dal/projects";
import { createLabel } from "../src/server/dal/labels";
import { createTask, updateTask } from "../src/server/dal/tasks";
import { addComment } from "../src/server/dal/comments";
import { addDays, todaySAST } from "../src/lib/dates";
import { runWeeklyNarratives } from "../src/server/jobs/weekly-narrative";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required (see .env.example)");
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 4 });
const db = drizzle(client, { schema }) as unknown as Db;

const at = (day: string, hour = 10) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+02:00`);

async function user(email: string, name: string) {
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (existing) return existing.id;
  const [row] = await db
    .insert(schema.users)
    .values({ email, name, emailVerified: new Date() })
    .returning({ id: schema.users.id });
  return row.id;
}

async function backdateTask(
  taskId: string,
  patch: Partial<{
    createdAt: Date;
    completedAt: Date;
    lastActivityAt: Date;
  }>,
) {
  await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, taskId));
  if (patch.createdAt) {
    await db
      .update(schema.activityEvents)
      .set({ createdAt: patch.createdAt })
      .where(eq(schema.activityEvents.taskId, taskId));
  }
  if (patch.completedAt) {
    const events = await db
      .select({ id: schema.activityEvents.id, type: schema.activityEvents.type })
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.taskId, taskId));
    for (const e of events) {
      if (e.type === "task_completed" || e.type === "task_status_changed") {
        await db
          .update(schema.activityEvents)
          .set({ createdAt: patch.completedAt })
          .where(eq(schema.activityEvents.id, e.id));
      }
    }
  }
}

async function main() {
  console.log("Seeding demo workspace…");
  const today = todaySAST();
  const d = (offset: number) => addDays(today, offset);

  const lerato = await user("lerato@mzansi.studio", "Lerato Mokoena");
  const thabo = await user("thabo@mzansi.studio", "Thabo Nkosi");
  const naledi = await user("naledi@mzansi.studio", "Naledi Dlamini");
  const sipho = await user("sipho@mzansi.studio", "Sipho van Wyk");

  const ws = await createWorkspace(db, lerato, {
    name: "Mzansi Studio",
    seedStarter: false,
  });
  for (const [userId, role] of [
    [thabo, "admin"],
    [naledi, "member"],
    [sipho, "member"],
  ] as const) {
    await db.insert(schema.memberships).values({
      workspaceId: ws.id,
      userId,
      role,
    });
    await db.insert(schema.activityEvents).values({
      workspaceId: ws.id,
      type: "member_joined",
      actorId: userId,
      data: { role },
      createdAt: at(d(-20)),
    });
  }

  const ctx = await resolveCtx(db, lerato, ws.id);
  const ctxThabo = await resolveCtx(db, thabo, ws.id);
  const ctxNaledi = await resolveCtx(db, naledi, ws.id);

  const design = await createLabel(ctx, { name: "Design", color: "#5B7C99" });
  const copy = await createLabel(ctx, { name: "Copy", color: "#D9A13B" });
  const dev = await createLabel(ctx, { name: "Dev", color: "#6FAE87" });
  const admin = await createLabel(ctx, { name: "Admin", color: "#66757C" });

  const liberty = await createProject(ctx, {
    name: "Liberty rebrand",
    color: "#5B7C99",
    clientName: "Liberty",
  });
  const vodacom = await createProject(ctx, {
    name: "Vodacom retainer",
    color: "#6FAE87",
    clientName: "Vodacom",
  });
  const karoo = await createProject(ctx, {
    name: "Karoo Coffee website",
    color: "#D9A13B",
    clientName: "Karoo Coffee Co.",
  });

  interface SeedTask {
    ctx?: typeof ctx;
    project: string;
    title: string;
    assignee?: string;
    due?: string;
    priority?: "none" | "low" | "med" | "high";
    labels?: string[];
    description?: string;
    /** created N days ago */
    created: number;
    /** completed N days ago (implies done) */
    completed?: number;
    /** last touched N days ago (stale simulation) */
    touched?: number;
    comment?: { by: typeof ctx; body: string };
  }

  const tasks: SeedTask[] = [
    // ---- Liberty rebrand: a project quietly going sideways ----
    { project: liberty.id, title: "Stakeholder interviews", assignee: thabo, created: 19, completed: 15, labels: [admin.id] },
    { project: liberty.id, title: "Brand audit deck", assignee: thabo, created: 18, completed: 12, labels: [design.id] },
    { project: liberty.id, title: "Moodboards: three directions", assignee: naledi, created: 14, completed: 8, labels: [design.id] },
    { project: liberty.id, title: "Logo exploration round 1", assignee: naledi, created: 10, due: d(-2), priority: "high", labels: [design.id], touched: 7, description: "Client leans geometric. Avoid anything close to the old serif mark." },
    { project: liberty.id, title: "Tone of voice document", assignee: sipho, created: 9, due: d(-1), priority: "med", labels: [copy.id], touched: 6 },
    { project: liberty.id, title: "Client review: direction lock", assignee: lerato, created: 8, due: d(2), priority: "high", labels: [admin.id], touched: 6 },
    // ---- Vodacom retainer: the healthy engine ----
    { project: vodacom.id, title: "July social calendar", assignee: naledi, created: 12, completed: 9, labels: [copy.id] },
    { project: vodacom.id, title: "Winter campaign banners", assignee: thabo, created: 10, completed: 6, labels: [design.id] },
    { project: vodacom.id, title: "Landing page tweaks", assignee: sipho, created: 8, completed: 4, labels: [dev.id] },
    { project: vodacom.id, title: "Store locator bug fix", assignee: sipho, created: 6, completed: 2, labels: [dev.id], comment: { by: ctxThabo, body: "Tested on my Samsung, sharp. Shipping it." } },
    { project: vodacom.id, title: "August content plan", assignee: naledi, created: 5, completed: 1, labels: [copy.id] },
    { project: vodacom.id, title: "Reels batch: 6 cutdowns", assignee: thabo, created: 4, due: d(1), priority: "med", labels: [design.id] },
    { project: vodacom.id, title: "Monthly report for client", assignee: naledi, created: 3, due: today, priority: "high", labels: [admin.id], comment: { by: ctxNaledi, body: "Waiting on the analytics export, will wrap this afternoon." } },
    { project: vodacom.id, title: "Paid media brief: spring push", assignee: thabo, created: 2, due: d(3), labels: [copy.id] },
    // ---- Karoo Coffee: ramping up ----
    { project: karoo.id, title: "Kickoff call notes + scope", assignee: lerato, created: 7, completed: 5, labels: [admin.id] },
    { project: karoo.id, title: "Sitemap + wireframes", assignee: thabo, created: 5, due: d(2), priority: "med", labels: [design.id] },
    { project: karoo.id, title: "Homepage copy draft", assignee: sipho, created: 4, due: d(4), labels: [copy.id] },
    { project: karoo.id, title: "Product photography shot list", assignee: naledi, created: 4, due: d(5), labels: [design.id] },
    { project: karoo.id, title: "Set up staging + repo", assignee: sipho, created: 3, due: d(6), labels: [dev.id] },
    { project: karoo.id, title: "Roastery visit for brand shoot", created: 2, due: d(8), priority: "low", labels: [admin.id] },
  ];

  let created = 0;
  for (const t of tasks) {
    const creator = t.ctx ?? ctx;
    const task = await createTask(creator, {
      projectId: t.project,
      title: t.title,
      description: t.description ?? "",
      status: "todo",
      assigneeId: t.assignee ?? null,
      dueDate: t.due ?? null,
      priority: t.priority ?? "none",
      labelIds: t.labels ?? [],
    });

    if (t.completed !== undefined) {
      await updateTask(creator, task.id, { status: "done" });
      await backdateTask(task.id, {
        createdAt: at(d(-t.created), 9),
        completedAt: at(d(-t.completed), 15),
        lastActivityAt: at(d(-t.completed), 15),
      });
    } else {
      const started = t.priority === "high" || Math.random() > 0.5;
      if (started) {
        await updateTask(creator, task.id, { status: "in_progress" });
      }
      await backdateTask(task.id, {
        createdAt: at(d(-t.created), 9),
        lastActivityAt: at(d(-(t.touched ?? Math.min(t.created, 1))), 12),
      });
    }

    if (t.comment) {
      await addComment(t.comment.by, task.id, { body: t.comment.body });
    }
    created++;
  }

  // A confirmed voice capture, for the audit trail.
  await db.insert(schema.voiceCaptures).values({
    workspaceId: ws.id,
    userId: lerato,
    source: "voice",
    transcript:
      "Okay so from the Vodacom call. Naledi to get the monthly report out by end of day today, Thabo the reels cutdowns by tomorrow, and someone needs to start the paid media brief for the spring push.",
    extraction: { proposals: [] },
    engine: "seed",
    status: "confirmed",
    createdAt: at(d(-3), 11),
  });

  // Generate last week's narrative so the dashboard opens with the flagship.
  const narrative = await runWeeklyNarratives(db);

  console.log(`\n✔ Seeded workspace "Mzansi Studio" (${ws.slug})`);
  console.log(`  ${created} tasks across 3 client projects, 4 members`);
  console.log(`  narratives generated: ${narrative.generated}`);
  console.log(`\nSign in as lerato@mzansi.studio (owner), thabo@… (admin),`);
  console.log(`naledi@… or sipho@… (members) via magic link.`);
  console.log(`Without RESEND_API_KEY the link prints to the dev server console.\n`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
