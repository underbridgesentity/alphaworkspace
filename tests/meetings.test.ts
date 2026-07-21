/**
 * Meetings (M1): the metering gate, the processing pipeline with injected
 * externals, the private-by-default visibility wall (admins included), and
 * the confirm step that turns action items into real tasks.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { createWorkspace } from "@/server/dal/workspaces";
import { createProject } from "@/server/dal/projects";
import {
  beginMeeting,
  deleteMeeting,
  deleteMeetingAudio,
  getMeeting,
  listMeetings,
  meetingAudioUrl,
  processMeeting,
  resolveActionItem,
  updateMeeting,
  usedMeetingMinutes,
  type MeetingDeps,
} from "@/server/dal/meetings";
import {
  LimitError,
  NotFoundError,
  ValidationError,
} from "@/server/dal/errors";
import type { Ctx } from "@/server/dal/context";
import {
  addMember,
  createTestDb,
  createTestUser,
  ctxFor,
} from "./helpers/db";

let db: Db;
let recorder: { id: string };
let admin: { id: string };
let member: { id: string };
let ws: { id: string; slug: string };
let projectId: string;

/** Storage + AI stubs; each test overrides what it cares about. */
const stubs = (over: Partial<MeetingDeps> = {}): MeetingDeps => ({
  prepareBucket: async () => undefined,
  signUpload: async () => ({ url: "https://stub/put", token: "t" }),
  signDownload: async () => "https://stub/get",
  resolveSize: async () => null,
  removeObject: async () => undefined,
  transcriber: async () => ({
    transcript: "Naledi will send the Vodacom report by Friday.",
    utterances: [
      { speaker: 0, start: 0, end: 4, text: "Naledi will send the Vodacom report by Friday." },
    ],
    durationSec: 300,
    engine: "nova-3",
  }),
  summarizer: async () => ({
    summary: {
      tldr: "Weekly status. The report goes out Friday.",
      decisions: ["Ship the report Friday"],
      risks: [],
    },
    actionItems: [
      {
        title: "Send the Vodacom report",
        note: null,
        assigneeId: null,
        assigneeName: "Naledi",
        dueDate: null,
        projectId: null,
        status: "pending" as const,
        taskId: null,
      },
      {
        title: "Book the client review",
        note: "Sometime next week",
        assigneeId: null,
        assigneeName: null,
        dueDate: null,
        projectId: null,
        status: "pending" as const,
        taskId: null,
      },
    ],
    engine: "claude-test",
  }),
  ...over,
});

async function recordedMeeting(
  ctx: Ctx,
  over: Partial<MeetingDeps> = {},
): Promise<string> {
  const { meetingId } = await beginMeeting(
    ctx,
    { title: "Standup", mime: "audio/webm", sizeBytes: 1_000_000, durationSec: 300 },
    stubs(),
  );
  await processMeeting(ctx, meetingId, stubs(over));
  return meetingId;
}

beforeAll(async () => {
  db = await createTestDb();
  recorder = await createTestUser(db, "joseph@agency.co.za", "Joseph");
  admin = await createTestUser(db, "admin@agency.co.za", "Adele Admin");
  member = await createTestUser(db, "naledi@agency.co.za", "Naledi");
  ws = await createWorkspace(db, recorder.id, {
    name: "Agency",
    seedStarter: false,
  });
  await addMember(db, ws.id, admin.id, "admin");
  await addMember(db, ws.id, member.id, "member");
  const ctx = await ctxFor(db, recorder.id, ws.slug);
  projectId = (await createProject(ctx, { name: "Vodacom", color: "#17685C" })).id;
});

describe("metering", () => {
  it("blocks a new recording only once the month's minutes are spent", async () => {
    const ctx = await ctxFor(db, recorder.id, ws.slug);

    // Free plan: 60 min. 59 used → the next one may still start (leniency:
    // a finished recording is never thrown away)...
    await db.insert(schema.meetings).values({
      workspaceId: ws.id,
      createdBy: recorder.id,
      title: "Long one",
      status: "ready",
      durationSec: 59 * 60,
    });
    expect(await usedMeetingMinutes(ctx)).toBe(59);
    const ok = await beginMeeting(
      ctx,
      { title: "Spills over", mime: "audio/webm", sizeBytes: 1000, durationSec: 600 },
      stubs(),
    );
    expect(ok.meetingId).toBeTruthy();

    // The spillover still counts nothing while it's UPLOADING (never-delivered
    // audio must not burn phantom minutes)...
    expect(await usedMeetingMinutes(ctx)).toBe(59);
    // ...but once it reaches transcription it meters, taking usage to 69/60.
    await db
      .update(schema.meetings)
      .set({ status: "processing" })
      .where(eq(schema.meetings.id, ok.meetingId));
    expect(await usedMeetingMinutes(ctx)).toBe(69);

    // So now the gate is closed.
    await expect(
      beginMeeting(
        ctx,
        { title: "One too many", mime: "audio/webm", sizeBytes: 1000, durationSec: 60 },
        stubs(),
      ),
    ).rejects.toMatchObject({ limit: "meetings" });

    // Failed runs give the minutes back.
    await db
      .update(schema.meetings)
      .set({ status: "failed" })
      .where(eq(schema.meetings.workspaceId, ws.id));
    expect(await usedMeetingMinutes(ctx)).toBe(0);
  });

  it("refuses non-audio uploads", async () => {
    const ctx = await ctxFor(db, recorder.id, ws.slug);
    await expect(
      beginMeeting(
        ctx,
        { title: "Nope", mime: "application/pdf", sizeBytes: 1000, durationSec: 60 },
        stubs(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("processing pipeline", () => {
  it("transcribes, summarizes and meters with the measured duration", async () => {
    const ctx = await ctxFor(db, recorder.id, ws.slug);
    const { meetingId } = await beginMeeting(
      ctx,
      // Client declares 60s; Deepgram will measure 300s.
      { title: "Standup", mime: "audio/webm", sizeBytes: 500_000, durationSec: 60 },
      stubs(),
    );

    const dto = await processMeeting(ctx, meetingId, stubs());
    expect(dto.status).toBe("ready");
    expect(dto.durationSec).toBe(300); // measured wins, overage kept
    expect(dto.summary?.tldr).toContain("Friday");
    expect(dto.actionItems).toHaveLength(2);
    expect(dto.transcript?.utterances[0].speaker).toBe(0);
    expect(dto.engine).toBe("nova-3+claude-test");

    // The activity log knows, but a PRIVATE meeting's title stays out of it.
    const events = await db
      .select()
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.workspaceId, ws.id));
    const ev = events.find((e) => e.type === "meeting_recorded");
    expect(ev).toBeTruthy();
    expect((ev!.data as { title: string | null }).title).toBeNull();

    // Double-processing is refused.
    await expect(
      processMeeting(ctx, meetingId, stubs()),
    ).rejects.toBeInstanceOf(ValidationError);

    await deleteMeeting(ctx, meetingId, stubs());
  });

  it("records a failure on the row instead of throwing", async () => {
    const ctx = await ctxFor(db, recorder.id, ws.slug);
    const { meetingId } = await beginMeeting(
      ctx,
      { title: "Bad audio", mime: "audio/webm", sizeBytes: 1000, durationSec: 60 },
      stubs(),
    );
    const dto = await processMeeting(
      ctx,
      meetingId,
      stubs({
        transcriber: async () => {
          throw new Error("deepgram 500");
        },
      }),
    );
    expect(dto.status).toBe("failed");
    expect(dto.error).toBeTruthy();

    // Retry from failed works.
    const retried = await processMeeting(ctx, meetingId, stubs());
    expect(retried.status).toBe("ready");
    await deleteMeeting(ctx, meetingId, stubs());
  });

  it("works transcript-only when the summarizer is unavailable", async () => {
    const ctx = await ctxFor(db, recorder.id, ws.slug);
    const id = await recordedMeeting(ctx, { summarizer: async () => null });
    const dto = await getMeeting(ctx, id);
    expect(dto.status).toBe("ready");
    expect(dto.summary).toBeNull();
    expect(dto.actionItems).toHaveLength(0);
    expect(dto.transcript?.text).toContain("Vodacom");
    await deleteMeeting(ctx, id, stubs());
  });
});

describe("visibility wall", () => {
  it("hides a private meeting from everyone else, admins included", async () => {
    const ctx = await ctxFor(db, recorder.id, ws.slug);
    const id = await recordedMeeting(ctx);

    const adminCtx = await ctxFor(db, admin.id, ws.slug);
    const memberCtx = await ctxFor(db, member.id, ws.slug);

    await expect(getMeeting(adminCtx, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getMeeting(memberCtx, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(meetingAudioUrl(adminCtx, id, stubs())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect((await listMeetings(adminCtx)).map((m) => m.id)).not.toContain(id);

    // Nobody else can mutate, delete or confirm items on it either.
    await expect(
      updateMeeting(adminCtx, id, { title: "Mine now" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      resolveActionItem(adminCtx, id, { index: 0, action: "dismiss" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteMeeting(adminCtx, id, stubs())).rejects.toBeInstanceOf(
      NotFoundError,
    );

    // Creator shares it → the team can read (but still not edit).
    await updateMeeting(ctx, id, { visibility: "workspace" });
    expect((await getMeeting(adminCtx, id)).title).toBe("Standup");
    expect((await listMeetings(memberCtx)).map((m) => m.id)).toContain(id);
    await expect(
      updateMeeting(adminCtx, id, { title: "Still not yours" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await deleteMeeting(ctx, id, stubs());
  });

  it("forces team visibility when linked to a project", async () => {
    const ctx = await ctxFor(db, recorder.id, ws.slug);
    const id = await recordedMeeting(ctx);

    const linked = await updateMeeting(ctx, id, { projectId });
    expect(linked.visibility).toBe("workspace");

    // Can't go private while linked.
    await expect(
      updateMeeting(ctx, id, { visibility: "private" }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Unlink first, then private is fine.
    await updateMeeting(ctx, id, { projectId: null });
    const hidden = await updateMeeting(ctx, id, { visibility: "private" });
    expect(hidden.visibility).toBe("private");

    await deleteMeeting(ctx, id, stubs());
  });
});

describe("action items → tasks (confirm step)", () => {
  it("accept creates a real task, falling back to the meeting's project", async () => {
    const ctx = await ctxFor(db, recorder.id, ws.slug);
    const id = await recordedMeeting(ctx);
    await updateMeeting(ctx, id, { projectId });

    const { meeting, task } = await resolveActionItem(ctx, id, {
      index: 0,
      action: "accept",
      edits: { assigneeId: member.id, dueDate: "2026-07-24" },
    });
    expect(task).toBeTruthy();
    expect(task!.projectId).toBe(projectId); // meeting fallback
    expect(task!.assigneeId).toBe(member.id);
    expect(task!.dueDate).toBe("2026-07-24");
    expect(meeting.actionItems[0].status).toBe("accepted");
    expect(meeting.actionItems[0].taskId).toBe(task!.id);

    // The created task is an ordinary workspace task, visible to everyone.
    const memberCtx = await ctxFor(db, member.id, ws.slug);
    const [row] = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, task!.id));
    expect(row.workspaceId).toBe(memberCtx.workspace.id);

    // Double-accept is refused; dismiss on the other one works.
    await expect(
      resolveActionItem(ctx, id, { index: 0, action: "accept" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const dismissed = await resolveActionItem(ctx, id, {
      index: 1,
      action: "dismiss",
    });
    expect(dismissed.meeting.actionItems[1].status).toBe("dismissed");
    expect(dismissed.task).toBeNull();

    await deleteMeeting(ctx, id, stubs());
  });

  it("refuses accept when no project can be resolved", async () => {
    const ctx = await ctxFor(db, recorder.id, ws.slug);
    const id = await recordedMeeting(ctx); // no meeting project, item has none
    await expect(
      resolveActionItem(ctx, id, { index: 0, action: "accept" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await deleteMeeting(ctx, id, stubs());
  });
});

describe("audio cleanup", () => {
  it("deletes the audio but keeps transcript and summary", async () => {
    const ctx = await ctxFor(db, recorder.id, ws.slug);
    const id = await recordedMeeting(ctx);

    let removed = "";
    await deleteMeetingAudio(ctx, id, stubs({
      removeObject: async (p) => {
        removed = p;
      },
    }));
    expect(removed).toContain(`${ws.id}/meetings/`);

    const dto = await getMeeting(ctx, id);
    expect(dto.hasAudio).toBe(false);
    expect(dto.transcript?.text).toContain("Vodacom");
    await expect(meetingAudioUrl(ctx, id, stubs())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await deleteMeeting(ctx, id, stubs());
  });
});
