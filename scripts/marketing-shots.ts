/**
 * Product photography for the marketing page, camera is Playwright.
 *
 * Stages the seeded LOCAL workspace like a set (removes e2e leftovers, balances
 * board columns, freshens due dates, gives the week believable completion
 * activity), regenerates the morning brief and weekly narrative through the
 * app's own jobs, then shoots the flagship surfaces at 2x into
 * public/marketing/shots/ and writes manifest.json alongside them.
 *
 * Run (dev server must already be listening on port 3100):
 *   npm run dev:local -- --port 3100        # in another terminal, if not up
 *   npx tsx scripts/with-local-env.ts npx tsx --tsconfig tsconfig.scripts.json scripts/marketing-shots.ts
 *
 * Safe to re-run: staged rows carry ids prefixed "mkshot-" and are rebuilt
 * from scratch each time, junk deletion is by title pattern, date freshening
 * is relative to today. Refuses anything but a localhost database, twice
 * (with-local-env refuses first, this script re-asserts).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { chromium } from "@playwright/test";
import * as schema from "../src/server/db/schema";
import type { Db } from "../src/server/db";
import { addDays, todaySAST, weekStart } from "../src/lib/dates";
import { runWeeklyNarratives } from "../src/server/jobs/weekly-narrative";
import { runMorningJobs } from "../src/server/jobs/morning";
import { isLocalDatabaseUrl } from "../src/lib/local-db";

const BASE = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
const STATE = path.join(__dirname, "../e2e/.auth/owner.json");
const OUT = path.join(__dirname, "../public/marketing/shots");
/** Keep each PNG under this, per the marketing weight budget. */
const MAX_BYTES = 300 * 1024;

const url = process.env.DATABASE_URL;
if (!url || !isLocalDatabaseUrl(url)) {
  console.error("marketing-shots: DATABASE_URL must be a localhost database.");
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 4 });
const db = drizzle(client, { schema }) as unknown as Db;

/**
 * 10:00 SAST on a given day, the studio's mid-morning. Returned as an ISO
 * string, not a Date: postgres-js with prepare:false refuses Date parameters.
 */
const at = (day: string, hour = 10, minute = 0) =>
  new Date(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+02:00`,
  ).toISOString();

/* ------------------------------ staging ---------------------------------- */

interface Ids {
  ws: string;
  slug: string;
  users: Record<"lerato" | "thabo" | "naledi" | "sipho", string>;
  projects: Record<"retainer" | "website" | "rebrand", string>;
}

async function lookupIds(): Promise<Ids> {
  const rows = await client`
    select u.email, u.id as user_id, m.workspace_id, w.slug
    from users u
    join memberships m on m.user_id = u.id
    join workspaces w on w.id = m.workspace_id
    where u.email like '%@mzansi.studio'
    order by w.created_at desc`;
  if (rows.length === 0) throw new Error("seeded workspace not found, run npm run seed:local");
  const ws = rows[0].workspace_id as string;
  const slug = rows[0].slug as string;
  const byEmail = (handle: string) => {
    const r = rows.find((x) => x.email === `${handle}@mzansi.studio` && x.workspace_id === ws);
    if (!r) throw new Error(`seed user ${handle} not found`);
    return r.user_id as string;
  };
  const projects = await client`
    select id, name from projects where workspace_id = ${ws}`;
  const proj = (needle: string) => {
    const r = projects.find((p) => (p.name as string).toLowerCase().includes(needle));
    if (!r) throw new Error(`seed project matching "${needle}" not found`);
    return r.id as string;
  };
  return {
    ws,
    slug,
    users: {
      lerato: byEmail("lerato"),
      thabo: byEmail("thabo"),
      naledi: byEmail("naledi"),
      sipho: byEmail("sipho"),
    },
    projects: {
      retainer: proj("retainer"),
      website: proj("website"),
      rebrand: proj("rebrand"),
    },
  };
}

async function stage(ids: Ids): Promise<void> {
  const { ws, users, projects } = ids;
  const today = todaySAST();
  const monday = weekStart(today);
  const lastMonday = addDays(monday, -7);

  /* e2e and debug leftovers are not part of the set. */
  await client`
    delete from tasks
    where workspace_id = ${ws} and title ~* '^(e2e|dbg) '`;
  await client`
    delete from activity_events
    where workspace_id = ${ws} and (data ->> 'title') ~* '^(e2e|dbg) '`;
  await client`
    delete from private_tasks
    where workspace_id = ${ws} and title ~* '^(e2e|dbg) '`;

  /* Rebuild every staged row from scratch so re-runs cannot double up. */
  await client`delete from activity_events where id like 'mkshot-%'`;
  await client`delete from tasks where id like 'mkshot-%'`;
  await client`delete from private_tasks where id like 'mkshot-%'`;

  /* The rebrand board's To do column is empty once the junk is gone. */
  const todoTasks = [
    {
      id: "mkshot-task-signage",
      title: "Signage concepts: flagship store",
      assignee: users.sipho,
      due: addDays(today, 7),
      project: projects.rebrand,
    },
    {
      id: "mkshot-task-guidelines",
      title: "Brand guidelines: first draft",
      assignee: users.naledi,
      due: addDays(today, 11),
      project: projects.rebrand,
    },
    {
      id: "mkshot-task-stationery",
      title: "Stationery + collateral suite",
      assignee: users.thabo,
      due: addDays(today, 8),
      project: projects.rebrand,
    },
  ];
  for (const [i, t] of todoTasks.entries()) {
    const createdAt = at(today, 8, 40 + i * 7);
    await client`
      insert into tasks (id, workspace_id, project_id, title, status, assignee_id,
                         due_date, position, created_by, created_at, updated_at, last_activity_at)
      values (${t.id}, ${ws}, ${t.project}, ${t.title}, 'todo', ${t.assignee},
              ${t.due}, ${(i + 1) * 10}, ${users.lerato}, ${createdAt}, ${createdAt}, ${createdAt})`;
    await client`
      insert into activity_events (id, workspace_id, project_id, task_id, actor_id, type, data, created_at)
      values (${"mkshot-evt-created-" + i}, ${ws}, ${t.project}, ${t.id}, ${users.lerato},
              'task_created', ${JSON.stringify({ title: t.title })}::jsonb, ${createdAt})`;
  }

  /* A fourth Done card keeps the rebrand board's right column company. */
  const doneAt = at(addDays(lastMonday, 1), 15);
  await client`
    insert into tasks (id, workspace_id, project_id, title, status, assignee_id,
                       position, created_by, created_at, updated_at,
                       last_activity_at, completed_at)
    values ('mkshot-task-landscape', ${ws}, ${projects.rebrand},
            'Competitor landscape scan', 'done', ${users.thabo}, 5,
            ${users.lerato}, ${at(addDays(lastMonday, -3))}, ${doneAt},
            ${doneAt}, ${doneAt})`;
  await client`
    insert into activity_events (id, workspace_id, project_id, task_id, actor_id, type, data, created_at)
    values ('mkshot-evt-landscape', ${ws}, ${projects.rebrand},
            'mkshot-task-landscape', ${users.thabo}, 'task_completed',
            ${JSON.stringify({ title: "Competitor landscape scan" })}::jsonb, ${doneAt})`;

  /* My Work is Lerato's view and the seed leaves her nearly empty-handed.
   * Hand her a believable owner's plate: one more thing due today, two later
   * this week. The morning brief regenerates from this below. */
  await client`
    update tasks set assignee_id = ${users.lerato}, due_date = ${today}
    where workspace_id = ${ws} and title = 'Sitemap + wireframes' and status <> 'done'`;
  await client`
    update tasks set assignee_id = ${users.lerato}, due_date = ${addDays(today, 1)}
    where workspace_id = ${ws} and title = 'Paid media brief: spring push' and status <> 'done'`;
  await client`
    update tasks set assignee_id = ${users.lerato}, due_date = ${addDays(today, 4)}
    where workspace_id = ${ws} and title = 'Homepage copy draft' and status <> 'done'`;

  /* Her private list too, in place of stray e2e rows: mid progress, so the
   * "only you see these" section shows a live bar rather than 0%. */
  const privates: Array<[string, string | null, string | null]> = [
    ["mkshot-priv-qbr", addDays(today, 1), null],
    ["mkshot-priv-insurance", null, at(addDays(today, -1), 16)],
    ["mkshot-priv-indaba", addDays(today, 6), null],
  ];
  const privateTitles: Record<string, string> = {
    "mkshot-priv-qbr": "Prep agenda: Karoo Coffee QBR",
    "mkshot-priv-insurance": "Renew studio insurance",
    "mkshot-priv-indaba": "Book Design Indaba tickets",
  };
  for (const [id, due, completed] of privates) {
    await client`
      insert into private_tasks (id, workspace_id, user_id, title, due_date, created_at, completed_at)
      values (${id}, ${ws}, ${users.lerato}, ${privateTitles[id]}, ${due},
              ${at(addDays(today, -2))}, ${completed})`;
  }

  /* No card on set screams "overdue". The client report is due today, which
   * is exactly what the morning brief is for; everything else moves ahead. */
  await client`
    update tasks set due_date = ${today}
    where workspace_id = ${ws} and title = 'Monthly report for client' and status <> 'done'`;
  await client`
    with late as (
      select id, row_number() over (order by due_date, id) as rn
      from tasks
      where workspace_id = ${ws} and status <> 'done'
        and due_date < ${today} )
    update tasks t
    set due_date = (${today}::date + ((late.rn % 5) + 1) * interval '1 day')::date
    from late where t.id = late.id`;

  /* An agency that promises weekend delivery is not the story. Anything now
   * due on a Saturday or Sunday slides to the following Monday. */
  await client`
    update tasks
    set due_date = due_date + (8 - extract(isodow from due_date))::int
    where workspace_id = ${ws} and status <> 'done'
      and extract(isodow from due_date) in (6, 7)`;

  /* Nothing on the set has been "untouched for a while" either. */
  await client`
    with stale as (
      select id, row_number() over (order by id) as rn
      from tasks
      where workspace_id = ${ws} and status <> 'done'
        and last_activity_at < ${at(addDays(today, -4))} )
    update tasks t
    set last_activity_at = ${at(today, 9)}::timestamptz - ((stale.rn % 4)) * interval '1 day'
    from stale where t.id = stale.id`;

  /* The seed credits every completion to Lerato, which reads as a one-person
   * studio. Spread last week's five across the team. */
  const spread = [users.lerato, users.thabo, users.naledi, users.sipho, users.thabo];
  const lastWeekEvents = await client`
    select id from activity_events
    where workspace_id = ${ws} and type = 'task_completed'
      and created_at >= ${at(lastMonday, 0)} and created_at < ${at(monday, 0)}
    order by created_at`;
  for (const [i, row] of lastWeekEvents.entries()) {
    await client`
      update activity_events set actor_id = ${spread[i % spread.length]}
      where id = ${row.id}`;
  }

  /* This week's pulse: finished work the dashboard hero and momentum row can
   * count. Events only (task_id null), the boards already show their cards. */
  const thisWeek: Array<[string, string, string]> = [
    ["Menu board artwork: spring range", "retainer", "thabo"],
    ["Newsletter: July issue", "retainer", "naledi"],
    ["Photo selects: roastery shoot", "website", "lerato"],
    ["Nav + footer build", "website", "sipho"],
    ["Icon set v1", "rebrand", "sipho"],
    ["Typography shortlist", "rebrand", "naledi"],
  ];
  const daysSoFar = Math.max(
    1,
    Math.round(
      (Date.parse(at(today, 0)) - Date.parse(at(monday, 0))) / 86_400_000,
    ) + 1,
  );
  for (const [i, [title, project, actor]] of thisWeek.entries()) {
    const day = addDays(monday, i % daysSoFar);
    await client`
      insert into activity_events (id, workspace_id, project_id, actor_id, type, data, created_at)
      values (${"mkshot-week-" + i}, ${ws},
              ${projects[project as keyof Ids["projects"]]},
              ${users[actor as keyof Ids["users"]]},
              'task_completed', ${JSON.stringify({ title })}::jsonb, ${at(day, 10 + (i % 6), 15)})`;
  }

  /* Earlier weeks, so the eight-week throughput chart has a story: the seed
   * only reaches back two weeks and the bars before that sat at zero. */
  const history: Array<[number, number]> = [
    [7, 2], [6, 3], [5, 2], [4, 4], [3, 3],
  ];
  const historyTitles = [
    "Weekly status deck", "Retainer report", "Asset handover", "Print proof review",
    "Campaign wrap-up", "Social templates", "Quote for new scope", "Site copy edits",
  ];
  const actorsCycle = [users.thabo, users.naledi, users.sipho, users.lerato];
  const projectsCycle = [projects.retainer, projects.website, projects.rebrand];
  let h = 0;
  for (const [weeksBack, n] of history) {
    const start = addDays(monday, -7 * weeksBack);
    for (let i = 0; i < n; i++, h++) {
      await client`
        insert into activity_events (id, workspace_id, project_id, actor_id, type, data, created_at)
        values (${"mkshot-hist-" + h}, ${ws}, ${projectsCycle[h % projectsCycle.length]},
                ${actorsCycle[h % actorsCycle.length]}, 'task_completed',
                ${JSON.stringify({ title: historyTitles[h % historyTitles.length] })}::jsonb,
                ${at(addDays(start, 1 + ((i * 2) % 4)), 11 + i)})`;
    }
  }

  /* Regenerate the narrative and today's briefs from the staged data through
   * the product's own jobs, so what the camera sees is what the product does.
   * Their previous outputs (and the notifications those wrote) go first,
   * because both jobs are idempotent and would otherwise skip. */
  await client`delete from narrative_reports where workspace_id = ${ws}`;
  await client`
    delete from notifications
    where workspace_id = ${ws}
      and type in ('narrative_ready', 'task_due_soon', 'task_overdue')`;
  await client`
    delete from daily_briefs where workspace_id = ${ws} and day = ${today}`;
  const narrative = await runWeeklyNarratives(db);
  const morning = await runMorningJobs(db);
  console.log(
    `staged: narrative generated=${narrative.generated}, briefs=${morning.briefs}, nudges=${morning.nudged}`,
  );
}

/* ------------------------------- camera ---------------------------------- */

interface Shot {
  file: string;
  shows: string;
  theme: "light";
  width: number;
  height: number;
}

async function settle(msExtra: number, page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(msExtra);
}

/** sips-recompress toward the budget; downscales only when it must. */
function slim(file: string): { width: number; height: number } {
  const dims = () => {
    const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file])
      .toString();
    const w = Number(/pixelWidth: (\d+)/.exec(out)?.[1]);
    const h = Number(/pixelHeight: (\d+)/.exec(out)?.[1]);
    return { width: w, height: h };
  };
  let d = dims();
  let guard = 0;
  while (fs.statSync(file).size > MAX_BYTES && guard++ < 3) {
    const target = Math.round(Math.max(d.width, d.height) * 0.8);
    execFileSync("sips", ["-Z", String(target), file]);
    d = dims();
  }
  return d;
}

async function shoot(ids: Ids): Promise<Shot[]> {
  const res = await fetch(BASE).catch(() => null);
  if (!res || !res.ok) {
    throw new Error(`no dev server at ${BASE}; run: npm run dev:local -- --port 3100`);
  }
  if (!fs.existsSync(STATE)) {
    throw new Error(`no saved session at ${STATE}; run: npm run test:e2e (setup project)`);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const shots: Shot[] = [];

  const take = async (
    file: string,
    shows: string,
    viewport: { width: number; height: number },
    go: (page: import("@playwright/test").Page) => Promise<void>,
    /** When set, shoots just this element instead of the viewport. */
    target?: (page: import("@playwright/test").Page) => import("@playwright/test").Locator,
  ) => {
    const context = await browser.newContext({
      baseURL: BASE,
      storageState: STATE,
      viewport,
      deviceScaleFactor: 2,
      colorScheme: "light",
    });
    const page = await context.newPage();
    // The Next dev-tools badge is test chrome, not product. Keep it out of frame.
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.addEventListener("DOMContentLoaded", () =>
        document.head.appendChild(style),
      );
    });
    await go(page);
    const filePath = path.join(OUT, file);
    if (target) await target(page).screenshot({ path: filePath });
    else await page.screenshot({ path: filePath });
    await context.close();
    const { width, height } = slim(filePath);
    shots.push({ file, shows, theme: "light", width, height });
    console.log(`shot: ${file} ${width}x${height} ${(fs.statSync(filePath).size / 1024).toFixed(0)}KB`);
  };

  const desktop = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };

  await take(
    "board-desktop-light.png",
    "Project board (Sable rebrand): To do / In progress / Done columns with live cards",
    desktop,
    async (page) => {
      await page.goto(`/w/${ids.slug}/p/${ids.projects.rebrand}`);
      await page.getByRole("region", { name: "To do" }).waitFor();
      await settle(1800, page);
    },
  );

  await take(
    "my-work-desktop-light.png",
    "My Work: morning brief card plus the owner's task list, desktop",
    desktop,
    async (page) => {
      await page.goto(`/w/${ids.slug}`);
      await page.getByRole("heading", { name: "My Work" }).waitFor();
      await settle(1800, page);
    },
  );

  await take(
    "my-work-mobile-light.png",
    "My Work: morning brief card plus the owner's task list, mobile",
    mobile,
    async (page) => {
      await page.goto(`/w/${ids.slug}`);
      await page.getByRole("heading", { name: "My Work" }).waitFor();
      await settle(1800, page);
    },
  );

  await take(
    "pulse-desktop-light.png",
    "Pulse dashboard: weekly narrative up top, hero KPIs and momentum",
    desktop,
    async (page) => {
      await page.goto(`/w/${ids.slug}/dashboard`);
      await page.getByRole("heading", { name: "Pulse" }).waitFor();
      await settle(2400, page);
    },
  );

  await take(
    "weekly-briefing-card-light.png",
    "Weekly briefing card in close-up: the Monday narrative the workspace writes itself",
    desktop,
    async (page) => {
      await page.goto(`/w/${ids.slug}/dashboard`);
      await page.getByRole("heading", { name: "Pulse" }).waitFor();
      await settle(2400, page);
    },
    (page) => page.locator('section[aria-label="Weekly briefing"]'),
  );

  await browser.close();
  return shots;
}

/* -------------------------------- main ----------------------------------- */

async function main() {
  const ids = await lookupIds();
  await stage(ids);
  const shots = await shoot(ids);

  const manifest = {
    generatedAt: new Date().toISOString(),
    workspace: "Mzansi Studio (seeded local demo data, no real customers)",
    reproduce:
      "with the dev server up on 3100: npx tsx scripts/with-local-env.ts npx tsx --tsconfig tsconfig.scripts.json scripts/marketing-shots.ts",
    deviceScaleFactor: 2,
    shots,
  };
  fs.writeFileSync(
    path.join(OUT, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(`manifest: ${path.join(OUT, "manifest.json")}`);
}

main()
  .then(() => client.end())
  .catch((err) => {
    console.error(err);
    client.end();
    process.exit(1);
  });
