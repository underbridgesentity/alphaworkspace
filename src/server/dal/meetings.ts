/**
 * Recorded meetings (M1). The full pipeline: reserve an upload slot against
 * the plan's monthly minutes, the browser PUTs audio straight to storage,
 * then processing transcribes (Deepgram, diarized), summarizes (Claude, when
 * configured) and stores proposals. Confirmation is the only path from an
 * action item to a real task (product law: extract, show, confirm).
 *
 * VISIBILITY: private by default, and the wall is absolute, a private
 * meeting is a NotFoundError for everyone but its creator, admins included,
 * indistinguishable from "doesn't exist". Linking a meeting to a project
 * forces workspace visibility (project pages must never half-show things).
 *
 * External deps (storage, Deepgram, Claude) are injectable for tests.
 */
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import { meetings, projects, users } from "@/server/db/schema";
import type {
  MeetingActionItem,
  MeetingDTO,
  TaskDTO,
  UserLite,
} from "@/lib/types";
import { MEETING_MAX_BYTES, MEETING_MAX_SECONDS } from "@/lib/validators";
import { can } from "@/lib/plans";
import { ctxEntitlements, resolveCtx, type Ctx } from "./context";
import { createTask } from "./tasks";
import { listProjects } from "./projects";
import { listMembers } from "./workspaces";
import { listLabels } from "./labels";
import { logActivity } from "./activity";
import { LimitError, NotFoundError, ValidationError } from "./errors";
import {
  deleteObject,
  ensureBucket,
  objectSize,
  putObject,
  signedDownloadUrl,
  signedUploadUrl,
  storageConfigured,
} from "@/server/storage";
import {
  botAudioUrl,
  createBot,
  recallConfigured,
} from "@/server/meetingbot/recall";
import {
  transcribeUrlDiarized,
  transcriptionConfigured,
  keytermsFrom,
  type DiarizedResult,
  type TranscribeContext,
} from "@/server/ai/transcribe";
import {
  summarizeMeeting,
  type MeetingSummaryResult,
} from "@/server/ai/meeting-summary";
import { todaySAST, TZ } from "@/lib/dates";

type MeetingRow = typeof meetings.$inferSelect;

/** Injectable externals; production uses the real ones. */
export interface MeetingDeps {
  signUpload?: (path: string) => Promise<{ url: string; token: string }>;
  signDownload?: (path: string, expiresIn?: number) => Promise<string>;
  resolveSize?: (path: string) => Promise<number | null>;
  removeObject?: (path: string) => Promise<void>;
  storeObject?: (path: string, body: Uint8Array, mime: string) => Promise<void>;
  prepareBucket?: () => Promise<void>;
  transcriber?: (
    url: string,
    context: TranscribeContext,
  ) => Promise<DiarizedResult>;
  summarizer?: typeof summarizeMeeting;
  /** Recall.ai (bots). */
  botCreate?: typeof createBot;
  botAudio?: typeof botAudioUrl;
  /** Fetch the bot's finished MP3 (webhook path); returns bytes or null. */
  fetchAudio?: (url: string) => Promise<Uint8Array | null>;
}

const AUDIO_MIME = /^(audio\/[\w.+-]+|video\/(webm|mp4))$/i;

/** Deepgram pulls the object itself; a 2h recording needs room to download. */
const TRANSCRIBE_URL_TTL = 3600;
/** Playback in a browser: short, because the URL needs no session to replay. */
const MEETING_AUDIO_TTL = 300;

function extFor(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  return "bin";
}

/** Only the creator can pass this wall for a private meeting; admins can't. */
function visibleTo(ctx: Ctx) {
  return and(
    eq(meetings.workspaceId, ctx.workspace.id),
    sql`(${meetings.visibility} = 'workspace' or ${meetings.createdBy} = ${ctx.userId})`,
  );
}

function creatorOnly(ctx: Ctx, meetingId: string) {
  return and(
    eq(meetings.id, meetingId),
    eq(meetings.workspaceId, ctx.workspace.id),
    eq(meetings.createdBy, ctx.userId),
  );
}

function toDTO(
  row: MeetingRow,
  creator: UserLite | null,
  opts: { withTranscript?: boolean } = {},
): MeetingDTO {
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    visibility: row.visibility,
    status: row.status,
    source: row.source === "bot" ? "bot" : "device",
    botStatus: row.botStatus,
    durationSec: row.durationSec,
    hasAudio: Boolean(row.audioPath),
    createdBy: creator,
    createdAt: row.createdAt.toISOString(),
    summary: row.summary ?? null,
    actionItems: row.actionItems ?? [],
    speakerNames: row.speakerNames ?? null,
    ...(opts.withTranscript ? { transcript: row.transcript ?? null } : {}),
    error: row.error,
    engine: row.engine,
  };
}

/* ------------------------------ metering --------------------------------- */

/** Minutes consumed this calendar month (UTC), failed runs don't count. */
export async function usedMeetingMinutes(ctx: Ctx): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [row] = await ctx.db
    .select({
      total: sql<number>`coalesce(sum(ceil(${meetings.durationSec} / 60.0)), 0)`,
    })
    .from(meetings)
    .where(
      and(
        eq(meetings.workspaceId, ctx.workspace.id),
        // Meter only recordings that actually reached transcription. "failed"
        // never billed; "uploading" hasn't delivered audio yet (a tab closed
        // before the PUT would otherwise burn phantom minutes forever).
        ne(meetings.status, "failed"),
        ne(meetings.status, "uploading"),
        gte(meetings.createdAt, monthStart),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function meetingUsage(
  ctx: Ctx,
): Promise<{ usedMinutes: number; limitMinutes: number }> {
  return {
    usedMinutes: await usedMeetingMinutes(ctx),
    limitMinutes: ctxEntitlements(ctx).meetingMinutesPerMonth,
  };
}

/* ------------------------------ pipeline --------------------------------- */

/**
 * Step 1: reserve the recording after it's made. The gate is deliberately
 * lenient, it blocks only when the month's minutes are ALREADY spent, so a
 * recording that spills over the cap is never thrown away (the recorder UI
 * refuses to start when nothing remains; the 2 h hard cap bounds overage).
 */
export async function beginMeeting(
  ctx: Ctx,
  input: {
    id?: string;
    title: string;
    mime: string;
    sizeBytes: number;
    durationSec: number;
    projectId?: string | null;
  },
  deps: MeetingDeps = {},
): Promise<{ meetingId: string; uploadUrl: string; storagePath: string }> {
  if (!deps.signUpload && !storageConfigured()) {
    throw new ValidationError("Meeting audio isn't enabled on this server yet");
  }
  if (!AUDIO_MIME.test(input.mime)) {
    throw new ValidationError("That doesn't look like an audio recording");
  }
  if (input.sizeBytes > MEETING_MAX_BYTES) {
    throw new ValidationError("Meeting recordings are capped at 50 MB");
  }
  if (input.durationSec > MEETING_MAX_SECONDS) {
    throw new ValidationError("Meeting recordings are capped at 2 hours");
  }

  const { usedMinutes, limitMinutes } = await meetingUsage(ctx);
  if (usedMinutes >= limitMinutes) {
    throw new LimitError(
      "meetings",
      `Your workspace has used its ${limitMinutes} meeting minutes this month`,
    );
  }

  let projectId: string | null = input.projectId ?? null;
  if (projectId) {
    const [p] = await ctx.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspace.id)),
      );
    if (!p) throw new NotFoundError("Project not found");
  }

  await (deps.prepareBucket ?? ensureBucket)();
  const id = input.id ?? crypto.randomUUID();

  // The id may come from the client (offline-first creates), and the storage
  // path is derived from it. If it collides with a meeting that isn't this
  // caller's own, the insert below would be swallowed by onConflictDoNothing
  // while we still hand back a signed PUT for the object the existing (and
  // possibly private) meeting points at. Refuse, and give nothing away about
  // whether the id exists elsewhere.
  if (input.id) {
    const [clash] = await ctx.db
      .select({ workspaceId: meetings.workspaceId, createdBy: meetings.createdBy })
      .from(meetings)
      .where(eq(meetings.id, input.id));
    if (
      clash &&
      !(clash.workspaceId === ctx.workspace.id && clash.createdBy === ctx.userId)
    ) {
      throw new NotFoundError("Meeting not found");
    }
  }
  const storagePath = `${ctx.workspace.id}/meetings/${id}.${extFor(input.mime)}`;
  const { url } = await (deps.signUpload ?? signedUploadUrl)(storagePath);

  await ctx.db
    .insert(meetings)
    .values({
      id,
      workspaceId: ctx.workspace.id,
      createdBy: ctx.userId,
      projectId,
      // A linked meeting is team-visible from the first moment.
      visibility: projectId ? "workspace" : "private",
      title: input.title.slice(0, 200),
      status: "uploading",
      audioPath: storagePath,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      durationSec: input.durationSec,
    })
    .onConflictDoNothing({ target: meetings.id }); // offline replays are idempotent

  return { meetingId: id, uploadUrl: url, storagePath };
}

/** Record a failure on the row and return the DTO (never thrown at callers). */
async function markFailed(
  db: Ctx["db"],
  meetingId: string,
  message: string,
): Promise<MeetingDTO> {
  const [updated] = await db
    .update(meetings)
    .set({ status: "failed", error: message.slice(0, 500) })
    .where(eq(meetings.id, meetingId))
    .returning();
  return toDTO(updated, null, { withTranscript: true });
}

/**
 * The shared back half of every meeting: Deepgram from a URL, Claude when
 * configured, store, log activity. Device processing and the bot webhook
 * both land here. Catches its own errors into status "failed".
 */
async function runPipeline(
  ctx: Ctx,
  row: MeetingRow,
  audioUrl: string,
  deps: MeetingDeps,
): Promise<MeetingDTO> {
  try {
    const [projectList, memberList, labelList] = await Promise.all([
      listProjects(ctx),
      listMembers(ctx),
      listLabels(ctx),
    ]);
    const keyterms = keytermsFrom({
      members: memberList.map((m) => ({ name: m.name, email: m.email })),
      projects: projectList.map((p) => ({
        name: p.name,
        clientName: p.clientName,
      })),
      labels: labelList,
    });

    const t = await (deps.transcriber ?? transcribeUrlDiarized)(audioUrl, {
      keyterms,
    });

    // Deepgram's measured duration is billing truth; a recording that ran
    // past the client's declared length is kept (never punish a finished
    // meeting), it just meters more.
    const durationSec =
      t.durationSec > 0
        ? Math.min(t.durationSec, MEETING_MAX_SECONDS)
        : row.durationSec;

    let summarized: MeetingSummaryResult | null = null;
    if (t.transcript.trim()) {
      summarized = await (deps.summarizer ?? summarizeMeeting)(
        {
          title: row.title,
          transcript: t.transcript,
          utterances: t.utterances,
        },
        {
          projects: projectList.map((p) => ({
            id: p.id,
            name: p.name,
            clientName: p.clientName,
          })),
          members: memberList.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email,
          })),
          today: todaySAST(),
          timezone: TZ,
        },
      );
    }

    const [updated] = await ctx.db
      .update(meetings)
      .set({
        status: "ready",
        transcript: { text: t.transcript, utterances: t.utterances },
        summary: summarized?.summary ?? null,
        actionItems: summarized?.actionItems ?? [],
        durationSec,
        engine: summarized ? `${t.engine}+${summarized.engine}` : t.engine,
        error: null,
        processedAt: new Date(),
      })
      .where(eq(meetings.id, row.id))
      .returning();

    await logActivity(ctx.db, {
      workspaceId: ctx.workspace.id,
      type: "meeting_recorded",
      actorId: ctx.userId,
      data: {
        // A private meeting's title stays private, even in the activity log.
        title: updated.visibility === "workspace" ? updated.title : null,
        durationSec,
        source: updated.source,
      },
    });

    return toDTO(updated, null, { withTranscript: true });
  } catch (err) {
    console.error("[meetings] processing failed", err);
    return markFailed(
      ctx.db,
      row.id,
      "Something went wrong while transcribing. Try again.",
    );
  }
}

/**
 * Step 2: the upload finished; transcribe, summarize, store. Long-running,
 * the route sets maxDuration accordingly. A failure is recorded on the row
 * (status "failed" + friendly error) and returned, not thrown, so the UI can
 * offer retry; retry re-enters here from status "failed".
 */
export async function processMeeting(
  ctx: Ctx,
  meetingId: string,
  deps: MeetingDeps = {},
): Promise<MeetingDTO> {
  const [row] = await ctx.db
    .select()
    .from(meetings)
    .where(creatorOnly(ctx, meetingId));
  if (!row) throw new NotFoundError("Meeting not found");
  if (row.status === "ready") {
    throw new ValidationError("This meeting was already processed");
  }
  // NOTE: a "processing" row is deliberately allowed to re-enter. If the
  // previous run was killed (deploy, timeout, OOM) the row would otherwise be
  // stuck forever; the pipeline is idempotent (it overwrites), so a manual
  // retry recovers it. Rate limiting on the route bounds abuse.
  // A bot meeting normally processes itself off the webhook; manual retry is
  // only possible once its audio has been copied into our storage.
  if (row.source === "bot" && !row.audioPath) {
    throw new ValidationError("Bot recordings arrive on their own when the call ends");
  }
  if (!row.audioPath) {
    throw new ValidationError("This meeting has no audio to process");
  }

  if (!deps.transcriber && !transcriptionConfigured()) {
    return markFailed(
      ctx.db,
      row.id,
      "Transcription isn't configured on this server yet",
    );
  }

  await ctx.db
    .update(meetings)
    .set({ status: "processing", error: null })
    .where(eq(meetings.id, row.id));

  // Reconcile the real stored size; the begin gate trusted the client.
  try {
    const realSize = await (deps.resolveSize ?? objectSize)(row.audioPath);
    if (realSize !== null && realSize > MEETING_MAX_BYTES) {
      await (deps.removeObject ?? deleteObject)(row.audioPath).catch(
        () => undefined,
      );
      await ctx.db
        .update(meetings)
        .set({ audioPath: null, sizeBytes: 0 })
        .where(eq(meetings.id, row.id));
      return markFailed(
        ctx.db,
        row.id,
        "The recording was over the 50 MB cap and was removed",
      );
    }
    if (realSize !== null && realSize !== row.sizeBytes) {
      await ctx.db
        .update(meetings)
        .set({ sizeBytes: realSize })
        .where(eq(meetings.id, row.id));
    }
    // Machine-to-machine: Deepgram fetches this itself and a 2h recording
    // takes a while to pull, so this one genuinely needs the long TTL.
    const url = await (deps.signDownload ?? signedDownloadUrl)(
      row.audioPath,
      TRANSCRIBE_URL_TTL,
    );
    return await runPipeline(ctx, row, url, deps);
  } catch (err) {
    console.error("[meetings] processing failed", err);
    return markFailed(
      ctx.db,
      row.id,
      "Something went wrong while transcribing. Try again.",
    );
  }
}

/* ------------------------------ bots (M3) -------------------------------- */

/**
 * Send a Recall.ai notetaker into a Zoom/Meet/Teams call. Add-on gated:
 * "meeting_bots" lives only in a workspace's entitlements snapshot (operator
 * portal), never in a band. Same lenient minutes gate as recording, the
 * duration is only known when the call ends.
 */
export async function sendBot(
  ctx: Ctx,
  input: { meetingUrl: string; title: string; projectId?: string | null },
  deps: MeetingDeps = {},
): Promise<MeetingDTO> {
  if (!can(ctx.workspace.plan, "meeting_bots", ctx.workspace.entitlements)) {
    throw new LimitError(
      "feature",
      "Meeting bots are an add-on. Ask us to switch them on for your workspace",
      "meeting_bots",
    );
  }
  if (!deps.botCreate && !recallConfigured()) {
    throw new ValidationError("Meeting bots aren't enabled on this server yet");
  }

  const { usedMinutes, limitMinutes } = await meetingUsage(ctx);
  if (usedMinutes >= limitMinutes) {
    throw new LimitError(
      "meetings",
      `Your workspace has used its ${limitMinutes} meeting minutes this month`,
    );
  }

  let projectId: string | null = input.projectId ?? null;
  if (projectId) {
    const [p] = await ctx.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspace.id)),
      );
    if (!p) throw new NotFoundError("Project not found");
  }

  const id = crypto.randomUUID();
  const { botId } = await (deps.botCreate ?? createBot)({
    meetingUrl: input.meetingUrl,
    metadata: { meetingId: id, workspaceId: ctx.workspace.id },
  });

  const [row] = await ctx.db
    .insert(meetings)
    .values({
      id,
      workspaceId: ctx.workspace.id,
      createdBy: ctx.userId,
      projectId,
      visibility: projectId ? "workspace" : "private",
      title: input.title.slice(0, 200),
      status: "uploading",
      source: "bot",
      botId,
      botStatus: "joining_call",
    })
    .returning();
  return toDTO(row, null);
}

/** Grab the finished MP3 bytes; null when it doesn't fit our storage cap. */
async function defaultFetchAudio(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bot audio fetch ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf.byteLength <= MEETING_MAX_BYTES ? buf : null;
}

/**
 * Webhook entry: a Recall status change for some bot. SYSTEM-level (no
 * session); authority is the verified Svix signature, and the acting user is
 * the meeting's creator (their ctx re-derives the same privacy semantics).
 * Idempotent: Svix retries and duplicate "done" events no-op.
 */
export async function handleBotStatus(
  db: Db,
  botId: string,
  code: string,
  deps: MeetingDeps = {},
): Promise<"ok" | "ignored"> {
  const [row] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.botId, botId));
  if (!row) return "ignored";

  const FATAL: Record<string, string> = {
    fatal: "The bot couldn't join the call",
    recording_permission_denied:
      "The meeting host declined the recording permission",
  };

  if (FATAL[code]) {
    await db
      .update(meetings)
      .set({
        botStatus: code,
        // Only fail it if it never produced a recording.
        ...(row.status === "uploading"
          ? { status: "failed" as const, error: FATAL[code] }
          : {}),
      })
      .where(eq(meetings.id, row.id));
    return "ok";
  }

  if (code !== "done") {
    await db.update(meetings).set({ botStatus: code }).where(eq(meetings.id, row.id));
    return "ok";
  }

  // done → fetch the recording exactly once.
  const [claimed] = await db
    .update(meetings)
    .set({ status: "processing", botStatus: code, error: null })
    .where(
      and(
        eq(meetings.id, row.id),
        sql`${meetings.status} in ('uploading', 'failed')`,
      ),
    )
    .returning();
  if (!claimed) return "ignored"; // another delivery got here first

  const ctx = await resolveCtx(db, row.createdBy, row.workspaceId);

  try {
    const mediaUrl = await (deps.botAudio ?? botAudioUrl)(botId);
    if (!mediaUrl) {
      await markFailed(db, row.id, "The bot finished but there's no recording");
      return "ok";
    }

    // Keep a copy for playback when it fits our storage cap; transcribe
    // straight off Recall's presigned URL either way.
    let transcribeUrl = mediaUrl;
    const bytes = await (deps.fetchAudio ?? defaultFetchAudio)(mediaUrl).catch(
      () => null,
    );
    if (bytes) {
      const path = `${row.workspaceId}/meetings/${row.id}.mp3`;
      try {
        await (deps.storeObject ?? putObject)(path, bytes, "audio/mpeg");
        await db
          .update(meetings)
          .set({ audioPath: path, mime: "audio/mpeg", sizeBytes: bytes.byteLength })
          .where(eq(meetings.id, row.id));
        transcribeUrl = await (deps.signDownload ?? signedDownloadUrl)(
          path,
          TRANSCRIBE_URL_TTL,
        );
      } catch (err) {
        console.warn("[meetings] bot audio store failed, transcript-only", err);
      }
    }

    await runPipeline(ctx, claimed, transcribeUrl, deps);
    return "ok";
  } catch (err) {
    console.error("[meetings] bot processing failed", err);
    await markFailed(db, row.id, "Fetching the bot's recording failed. Try again.");
    return "ok";
  }
}

/* ------------------------------- reads ----------------------------------- */

export async function listMeetings(ctx: Ctx): Promise<MeetingDTO[]> {
  const rows = await ctx.db
    .select({
      m: meetings,
      creator: {
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      },
    })
    .from(meetings)
    .leftJoin(users, eq(meetings.createdBy, users.id))
    .where(visibleTo(ctx))
    .orderBy(desc(meetings.createdAt))
    .limit(200);
  return rows.map((r) => toDTO(r.m, r.creator?.id ? r.creator : null));
}

export async function getMeeting(ctx: Ctx, meetingId: string): Promise<MeetingDTO> {
  const rows = await ctx.db
    .select({
      m: meetings,
      creator: {
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      },
    })
    .from(meetings)
    .leftJoin(users, eq(meetings.createdBy, users.id))
    .where(and(eq(meetings.id, meetingId), visibleTo(ctx)));
  const row = rows[0];
  if (!row) throw new NotFoundError("Meeting not found");
  return toDTO(row.m, row.creator?.id ? row.creator : null, {
    withTranscript: true,
  });
}

/** Signed playback URL; same wall as getMeeting. */
export async function meetingAudioUrl(
  ctx: Ctx,
  meetingId: string,
  deps: MeetingDeps = {},
): Promise<string> {
  const [row] = await ctx.db
    .select({ audioPath: meetings.audioPath })
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), visibleTo(ctx)));
  if (!row) throw new NotFoundError("Meeting not found");
  if (!row.audioPath) throw new NotFoundError("The audio was deleted");
  // Reaches a browser: playback starts immediately, so keep the window tight.
  // A private recording is the most sensitive object we hold (POPIA), and a
  // signed URL needs no session at all once it leaves here.
  return (deps.signDownload ?? signedDownloadUrl)(
    row.audioPath,
    MEETING_AUDIO_TTL,
  );
}

/* ------------------------------ mutations -------------------------------- */

/** Creator-only. Linking a project forces team visibility, never silently. */
export async function updateMeeting(
  ctx: Ctx,
  meetingId: string,
  patch: {
    title?: string;
    visibility?: "private" | "workspace";
    projectId?: string | null;
    speakerNames?: Record<string, string>;
  },
): Promise<MeetingDTO> {
  const [row] = await ctx.db
    .select()
    .from(meetings)
    .where(creatorOnly(ctx, meetingId));
  if (!row) throw new NotFoundError("Meeting not found");

  const next: Partial<typeof meetings.$inferInsert> = {};
  if (patch.title !== undefined) next.title = patch.title.slice(0, 200);
  if (patch.speakerNames !== undefined) {
    // Merge over what's there so renaming one speaker keeps the others.
    next.speakerNames = { ...(row.speakerNames ?? {}), ...patch.speakerNames };
  }

  if (patch.projectId !== undefined) {
    if (patch.projectId) {
      const [p] = await ctx.db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, patch.projectId),
            eq(projects.workspaceId, ctx.workspace.id),
          ),
        );
      if (!p) throw new NotFoundError("Project not found");
    }
    next.projectId = patch.projectId;
  }

  const finalProjectId =
    patch.projectId !== undefined ? patch.projectId : row.projectId;
  if (patch.visibility !== undefined) {
    if (patch.visibility === "private" && finalProjectId) {
      throw new ValidationError(
        "Linked meetings stay visible to the team. Unlink the project first",
      );
    }
    next.visibility = patch.visibility;
  }
  if (finalProjectId) next.visibility = "workspace";

  const [updated] = await ctx.db
    .update(meetings)
    .set(next)
    .where(eq(meetings.id, row.id))
    .returning();
  return toDTO(updated, null, { withTranscript: true });
}

/**
 * Accept or dismiss one proposed action item. Accepting is the confirm step:
 * it creates a REAL task (workspace-visible, like any other task) and stamps
 * the item so it can't be accepted twice.
 */
export async function resolveActionItem(
  ctx: Ctx,
  meetingId: string,
  input: {
    index: number;
    action: "accept" | "dismiss";
    edits?: {
      title?: string;
      assigneeId?: string | null;
      dueDate?: string | null;
      projectId?: string;
    };
  },
): Promise<{ meeting: MeetingDTO; task: TaskDTO | null }> {
  const [row] = await ctx.db
    .select()
    .from(meetings)
    .where(creatorOnly(ctx, meetingId));
  if (!row) throw new NotFoundError("Meeting not found");

  const items: MeetingActionItem[] = [...(row.actionItems ?? [])];
  const item = items[input.index];
  if (!item) throw new NotFoundError("That action item doesn't exist");
  if (item.status !== "pending") {
    throw new ValidationError("That action item was already resolved");
  }

  let task: TaskDTO | null = null;
  if (input.action === "accept") {
    const projectId =
      input.edits?.projectId ?? item.projectId ?? row.projectId ?? null;
    if (!projectId) {
      throw new ValidationError("Pick a project for this task first");
    }
    task = await createTask(ctx, {
      projectId,
      title: (input.edits?.title ?? item.title).slice(0, 500),
      description: item.note ?? "",
      status: "todo",
      assigneeId:
        input.edits?.assigneeId !== undefined
          ? input.edits.assigneeId
          : item.assigneeId ?? null,
      dueDate:
        input.edits?.dueDate !== undefined
          ? input.edits.dueDate
          : item.dueDate ?? null,
      priority: "none",
      labelIds: [],
    });
    items[input.index] = { ...item, status: "accepted", taskId: task.id };
  } else {
    items[input.index] = { ...item, status: "dismissed" };
  }

  const [updated] = await ctx.db
    .update(meetings)
    .set({ actionItems: items })
    .where(eq(meetings.id, row.id))
    .returning();
  return { meeting: toDTO(updated, null, { withTranscript: true }), task };
}

/** Creator-only: drop the audio, keep transcript and summary (POPIA-friendly). */
export async function deleteMeetingAudio(
  ctx: Ctx,
  meetingId: string,
  deps: MeetingDeps = {},
): Promise<void> {
  const [row] = await ctx.db
    .select({ id: meetings.id, audioPath: meetings.audioPath })
    .from(meetings)
    .where(creatorOnly(ctx, meetingId));
  if (!row) throw new NotFoundError("Meeting not found");
  if (row.audioPath) {
    await (deps.removeObject ?? deleteObject)(row.audioPath).catch(() => undefined);
  }
  await ctx.db
    .update(meetings)
    .set({ audioPath: null })
    .where(eq(meetings.id, row.id));
}

export async function deleteMeeting(
  ctx: Ctx,
  meetingId: string,
  deps: MeetingDeps = {},
): Promise<void> {
  const [row] = await ctx.db
    .delete(meetings)
    .where(creatorOnly(ctx, meetingId))
    .returning({ audioPath: meetings.audioPath });
  if (!row) throw new NotFoundError("Meeting not found");
  if (row.audioPath) {
    await (deps.removeObject ?? deleteObject)(row.audioPath).catch(() => undefined);
  }
}
