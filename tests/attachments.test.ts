/**
 * Attachment size reconciliation: the confirm step must correct a
 * client-declared size against the real stored object, and refuse a file
 * that (truly) busts the per-file cap or the plan's storage quota.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { createWorkspace } from "@/server/dal/workspaces";
import { createProject } from "@/server/dal/projects";
import { createTask } from "@/server/dal/tasks";
import { confirmUpload } from "@/server/dal/attachments";
import { LimitError, ValidationError } from "@/server/dal/errors";
import { createTestDb, createTestUser, ctxFor } from "./helpers/db";

const MB = 1024 * 1024;

let db: Db;
let user: { id: string };
let ws: { id: string; slug: string };
let taskId: string;

beforeAll(async () => {
  db = await createTestDb();
  user = await createTestUser(db, "up@loader.co.za", "Uploader");
  ws = await createWorkspace(db, user.id, { name: "Files Co", seedStarter: false });
  const ctx = await ctxFor(db, user.id, ws.slug);
  const project = await createProject(ctx, { name: "P", color: "#17685C" });
  taskId = (
    await createTask(ctx, {
      projectId: project.id,
      title: "Has files",
      description: "",
      status: "todo",
      priority: "none",
      labelIds: [],
    })
  ).id;
});

async function insertAttachment(declared: number, path: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(schema.attachments).values({
    id,
    workspaceId: ws.id,
    taskId,
    uploaderId: user.id,
    name: "file.pdf",
    mime: "application/pdf",
    sizeBytes: declared,
    storagePath: path,
  });
  return id;
}

describe("attachment size reconciliation", () => {
  it("corrects an under-reported size to the real stored size", async () => {
    const ctx = await ctxFor(db, user.id, ws.slug);
    const id = await insertAttachment(1, `${ws.id}/${taskId}/small`);

    await confirmUpload(ctx, id, { resolveSize: async () => 3 * MB });

    const [row] = await db
      .select({ sizeBytes: schema.attachments.sizeBytes })
      .from(schema.attachments)
      .where(eq(schema.attachments.id, id));
    expect(row.sizeBytes).toBe(3 * MB);
  });

  it("deletes the object + row when the real size busts the 25 MB per-file cap", async () => {
    const ctx = await ctxFor(db, user.id, ws.slug);
    const id = await insertAttachment(1, `${ws.id}/${taskId}/toobig`);

    await expect(
      confirmUpload(ctx, id, { resolveSize: async () => 30 * MB }),
    ).rejects.toBeInstanceOf(ValidationError);

    const rows = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, id));
    expect(rows).toHaveLength(0);
  });

  it("refuses when the real size would blow the plan's storage quota", async () => {
    const ctx = await ctxFor(db, user.id, ws.slug);
    // Free plan = 200 MB. Fill most of it with an existing (directly-set) row.
    const bigId = await insertAttachment(199 * MB, `${ws.id}/${taskId}/big`);
    const id = await insertAttachment(1, `${ws.id}/${taskId}/tip`);

    await expect(
      confirmUpload(ctx, id, { resolveSize: async () => 5 * MB }),
    ).rejects.toBeInstanceOf(LimitError);

    // The tipping file is removed; the pre-existing one is untouched.
    const tip = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, id));
    expect(tip).toHaveLength(0);
    const [big] = await db
      .select({ sizeBytes: schema.attachments.sizeBytes })
      .from(schema.attachments)
      .where(eq(schema.attachments.id, bigId));
    expect(big.sizeBytes).toBe(199 * MB);

    // cleanup so later assertions on totals stay clean
    await db
      .delete(schema.attachments)
      .where(and(eq(schema.attachments.id, bigId)));
  });

  it("leaves the row alone when the size can't be read (null) or already matches", async () => {
    const ctx = await ctxFor(db, user.id, ws.slug);
    const id = await insertAttachment(2 * MB, `${ws.id}/${taskId}/unknown`);

    await confirmUpload(ctx, id, { resolveSize: async () => null });
    await confirmUpload(ctx, id, { resolveSize: async () => 2 * MB });

    const [row] = await db
      .select({ sizeBytes: schema.attachments.sizeBytes })
      .from(schema.attachments)
      .where(eq(schema.attachments.id, id));
    expect(row.sizeBytes).toBe(2 * MB);
  });
});
