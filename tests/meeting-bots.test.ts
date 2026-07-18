/**
 * M2 + M3: speaker naming, and the Recall.ai bot flow with every external
 * injected (create bot, fetch audio, storage, Deepgram, webhook signature).
 */
import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { createWorkspace } from "@/server/dal/workspaces";
import { createProject } from "@/server/dal/projects";
import {
  beginMeeting,
  getMeeting,
  handleBotStatus,
  processMeeting,
  sendBot,
  updateMeeting,
  type MeetingDeps,
} from "@/server/dal/meetings";
import { verifyRecallWebhook } from "@/server/meetingbot/recall";
import { NotFoundError } from "@/server/dal/errors";
import { PLANS } from "@/lib/plans";
import {
  addMember,
  createTestDb,
  createTestUser,
  ctxFor,
} from "./helpers/db";

let db: Db;
let owner: { id: string };
let member: { id: string };
let ws: { id: string; slug: string };
let projectId: string;

const stubs = (over: Partial<MeetingDeps> = {}): MeetingDeps => ({
  prepareBucket: async () => undefined,
  signUpload: async () => ({ url: "https://stub/put", token: "t" }),
  signDownload: async () => "https://stub/get",
  resolveSize: async () => null,
  removeObject: async () => undefined,
  transcriber: async () => ({
    transcript: "We agreed the launch moves to Monday.",
    utterances: [
      { speaker: 0, start: 0, end: 2, text: "We agreed the launch" },
      { speaker: 1, start: 2, end: 4, text: "moves to Monday." },
    ],
    durationSec: 600,
    engine: "nova-3",
  }),
  summarizer: async () => null,
  ...over,
});

async function enableBots(): Promise<void> {
  // A complete snapshot, exactly as production writes it, with the add-on
  // flag and room for several test meetings before the minutes gate bites.
  await db
    .update(schema.workspaces)
    .set({
      entitlements: {
        maxMembers: PLANS.free.maxMembers,
        maxActiveProjects: PLANS.free.maxActiveProjects,
        voiceCapturesPerMonth: PLANS.free.voiceCapturesPerMonth,
        meetingMinutesPerMonth: 1_000,
        features: [...PLANS.free.features, "meeting_bots"],
      },
    })
    .where(eq(schema.workspaces.id, ws.id));
}

beforeAll(async () => {
  db = await createTestDb();
  owner = await createTestUser(db, "owner@bots.co.za", "Owner");
  member = await createTestUser(db, "member@bots.co.za", "Member");
  ws = await createWorkspace(db, owner.id, { name: "Bots Co", seedStarter: false });
  await addMember(db, ws.id, member.id, "member");
  const ctx = await ctxFor(db, owner.id, ws.slug);
  projectId = (await createProject(ctx, { name: "Launch", color: "#17685C" })).id;
});

describe("speaker naming (M2)", () => {
  it("creator names speakers; merges; others can't touch it", async () => {
    const ctx = await ctxFor(db, owner.id, ws.slug);
    const { meetingId } = await beginMeeting(
      ctx,
      { title: "Standup", mime: "audio/webm", sizeBytes: 1000, durationSec: 60 },
      stubs(),
    );
    await processMeeting(ctx, meetingId, stubs());

    let dto = await updateMeeting(ctx, meetingId, { speakerNames: { "0": "Naledi" } });
    expect(dto.speakerNames).toEqual({ "0": "Naledi" });

    dto = await updateMeeting(ctx, meetingId, { speakerNames: { "1": "Thabo" } });
    expect(dto.speakerNames).toEqual({ "0": "Naledi", "1": "Thabo" });

    // Share it; a reader still can't rename (creator-only wall).
    await updateMeeting(ctx, meetingId, { visibility: "workspace" });
    const memberCtx = await ctxFor(db, member.id, ws.slug);
    expect((await getMeeting(memberCtx, meetingId)).speakerNames).toEqual({
      "0": "Naledi",
      "1": "Thabo",
    });
    await expect(
      updateMeeting(memberCtx, meetingId, { speakerNames: { "0": "Me" } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("meeting bots (M3)", () => {
  it("is gated as an add-on, then sends a bot and tracks it", async () => {
    const ctx = await ctxFor(db, owner.id, ws.slug);

    // Off by default, whatever the band.
    await expect(
      sendBot(
        ctx,
        { meetingUrl: "https://meet.google.com/abc-defg-hij", title: "Client call" },
        stubs({ botCreate: async () => ({ botId: "bot_1" }) }),
      ),
    ).rejects.toMatchObject({ limit: "feature", feature: "meeting_bots" });

    await enableBots();
    const fresh = await ctxFor(db, owner.id, ws.slug); // re-read entitlements

    const dto = await sendBot(
      fresh,
      { meetingUrl: "https://meet.google.com/abc-defg-hij", title: "Client call" },
      stubs({ botCreate: async () => ({ botId: "bot_1" }) }),
    );
    expect(dto.source).toBe("bot");
    expect(dto.status).toBe("uploading");
    expect(dto.visibility).toBe("private");

    // Status updates flow through; non-terminal codes just annotate.
    await handleBotStatus(db, "bot_1", "in_call_recording", stubs());
    const [row] = await db
      .select()
      .from(schema.meetings)
      .where(eq(schema.meetings.botId, "bot_1"));
    expect(row.botStatus).toBe("in_call_recording");
    expect(row.status).toBe("uploading");

    // Unknown bot ids are ignored quietly (webhooks for deleted meetings).
    expect(await handleBotStatus(db, "bot_nobody", "done", stubs())).toBe("ignored");
  });

  it("done → fetches audio, stores it, transcribes, goes ready once", async () => {
    let stored: { path: string; bytes: number } | null = null;
    const deps = stubs({
      botAudio: async () => "https://recall.example/audio.mp3",
      fetchAudio: async () => new Uint8Array(2048),
      storeObject: async (path, bytes) => {
        stored = { path, bytes: bytes.byteLength };
      },
    });

    expect(await handleBotStatus(db, "bot_1", "done", deps)).toBe("ok");

    const [row] = await db
      .select()
      .from(schema.meetings)
      .where(eq(schema.meetings.botId, "bot_1"));
    expect(row.status).toBe("ready");
    expect(row.durationSec).toBe(600); // Deepgram metadata metered
    expect(row.audioPath).toContain(`${ws.id}/meetings/`);
    expect(stored!.path).toBe(row.audioPath);
    expect(row.transcript?.text).toContain("Monday");

    const events = await db
      .select()
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.workspaceId, ws.id));
    const botEvents = events.filter(
      (e) =>
        e.type === "meeting_recorded" &&
        (e.data as { source?: string }).source === "bot",
    );
    expect(botEvents).toHaveLength(1);

    // Svix retries the same event: the claim guard makes it a no-op.
    expect(await handleBotStatus(db, "bot_1", "done", deps)).toBe("ignored");
  });

  it("oversized bot audio still transcribes from the vendor URL", async () => {
    const ctx = await ctxFor(db, owner.id, ws.slug);
    const dto = await sendBot(
      ctx,
      {
        meetingUrl: "https://zoom.us/j/123",
        title: "Big call",
        projectId,
      },
      stubs({ botCreate: async () => ({ botId: "bot_2" }) }),
    );
    expect(dto.visibility).toBe("workspace"); // linked at send time

    let transcribedFrom = "";
    await handleBotStatus(
      db,
      "bot_2",
      "done",
      stubs({
        botAudio: async () => "https://recall.example/huge.mp3",
        fetchAudio: async () => null, // over the storage cap
        transcriber: async (url) => {
          transcribedFrom = url;
          return {
            transcript: "long call",
            utterances: [],
            durationSec: 3600,
            engine: "nova-3",
          };
        },
      }),
    );
    const [row] = await db
      .select()
      .from(schema.meetings)
      .where(eq(schema.meetings.botId, "bot_2"));
    expect(row.status).toBe("ready");
    expect(row.audioPath).toBeNull(); // playback skipped, notes kept
    expect(transcribedFrom).toBe("https://recall.example/huge.mp3");
  });

  it("fatal codes fail the meeting with friendly copy", async () => {
    const ctx = await ctxFor(db, owner.id, ws.slug);
    await sendBot(
      ctx,
      { meetingUrl: "https://teams.microsoft.com/l/meetup-join/xyz", title: "Doomed" },
      stubs({ botCreate: async () => ({ botId: "bot_3" }) }),
    );
    await handleBotStatus(db, "bot_3", "recording_permission_denied", stubs());
    const [row] = await db
      .select()
      .from(schema.meetings)
      .where(eq(schema.meetings.botId, "bot_3"));
    expect(row.status).toBe("failed");
    expect(row.error).toContain("declined");
  });
});

describe("webhook signature (Svix scheme)", () => {
  const secret = `whsec_${Buffer.from("a-32-byte-signing-key-for-tests!").toString("base64")}`;
  const body = JSON.stringify({ event: "bot.done", data: { bot: { id: "b" } } });

  function sign(id: string, ts: string, payload: string): string {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    return createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64");
  }
  function headers(map: Record<string, string>) {
    return { get: (name: string) => map[name.toLowerCase()] ?? null };
  }

  it("accepts a valid signature on either header family", async () => {
    const now = Date.now();
    const ts = String(Math.floor(now / 1000));
    const sig = `v1,${sign("msg_1", ts, body)}`;
    expect(
      verifyRecallWebhook(
        headers({ "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": sig }),
        body,
        secret,
        now,
      ),
    ).toBe(true);
    expect(
      verifyRecallWebhook(
        headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,bogus ${sig}` }),
        body,
        secret,
        now,
      ),
    ).toBe(true);
  });

  it("rejects tampered bodies, stale timestamps and missing secrets", async () => {
    const now = Date.now();
    const ts = String(Math.floor(now / 1000));
    const sig = `v1,${sign("msg_1", ts, body)}`;
    const h = headers({ "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": sig });

    expect(verifyRecallWebhook(h, body + "x", secret, now)).toBe(false);
    expect(verifyRecallWebhook(h, body, undefined, now)).toBe(false);

    const stale = String(Math.floor(now / 1000) - 3600);
    expect(
      verifyRecallWebhook(
        headers({
          "webhook-id": "msg_1",
          "webhook-timestamp": stale,
          "webhook-signature": `v1,${sign("msg_1", stale, body)}`,
        }),
        body,
        secret,
        now,
      ),
    ).toBe(false);
  });
});
