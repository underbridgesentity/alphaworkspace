/**
 * zod schemas for every API boundary. The client uses these to build
 * payloads; route handlers must parse with them before touching the DAL.
 */
import { z } from "zod";
import { REACTION_EMOJI } from "@/lib/reactions";

export const uuid = z.uuid();
export const dayString = z.iso.date(); // YYYY-MM-DD

export const taskStatusSchema = z.enum(["todo", "in_progress", "done", "custom"]);
export const prioritySchema = z.enum(["none", "low", "med", "high"]);
export const roleSchema = z.enum(["owner", "admin", "member"]);
export const invitableRoleSchema = z.enum(["admin", "member"]);

export const recurrenceSchema = z
  .object({
    freq: z.enum(["daily", "weekly", "monthly"]),
    interval: z.number().int().min(1).max(12).optional(),
  })
  .nullable();

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a #rrggbb colour");

/**
 * Board/list ordering key. Fractional midpoints are by design (drag-drop
 * inserts between neighbours), so this stays a float; the bounds just keep a
 * client from persisting absurd magnitudes. Real values live in the thousands.
 */
const positionValue = z.number().finite().min(-1e12).max(1e12);

/* ------------------------------ tasks ----------------------------------- */

export const taskCreateSchema = z.object({
  /** Client-generated for offline-first creates; server generates if absent. */
  id: uuid.optional(),
  projectId: uuid,
  title: z.string().trim().min(1, "Give the task a title").max(500),
  description: z.string().max(20_000).default(""),
  status: taskStatusSchema.default("todo"),
  assigneeId: uuid.nullish(),
  dueDate: dayString.nullish(),
  priority: prioritySchema.default("none"),
  position: positionValue.optional(),
  recurrence: recurrenceSchema.optional(),
  labelIds: z.array(uuid).max(20).default([]),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(20_000),
    status: taskStatusSchema,
    assigneeId: uuid.nullable(),
    dueDate: dayString.nullable(),
    priority: prioritySchema,
    position: positionValue,
    projectId: uuid,
    recurrence: recurrenceSchema,
    labelIds: z.array(uuid).max(20),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

/* ------------------------------ comments -------------------------------- */

export const commentCreateSchema = z.object({
  id: uuid.optional(),
  body: z.string().trim().min(1, "Say something").max(5_000),
});

export const reactionToggleSchema = z.object({
  emoji: z.enum(REACTION_EMOJI),
});

/* ---------------------------- scorecards (P2) ---------------------------- */

export const scorecardCreateSchema = z.object({
  name: z.string().trim().min(1, "Name the scorecard").max(60),
  unit: z.enum(["count", "currency", "percent", "hours"]).default("count"),
  target: z.number().finite().positive().nullish(),
  period: z.enum(["weekly", "monthly"]).default("weekly"),
});

export const scorecardEntrySchema = z.object({
  periodStart: dayString,
  value: z.number().finite().gte(-1_000_000_000).lte(1_000_000_000),
});

/* --------------------------- time tracking (P2) -------------------------- */

export const timeStartSchema = z.object({ taskId: uuid });

export const timeLogSchema = z.object({
  taskId: uuid,
  minutes: z.number().int().min(1).max(1_440),
  note: z.string().trim().max(200).optional(),
});

/* ------------------------------ projects -------------------------------- */

export const projectCreateSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Name the project").max(120),
  color: hexColor.default("#5B7C99"),
  clientName: z.string().trim().max(120).nullish(),
});

export const projectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    color: hexColor,
    clientName: z.string().trim().max(120).nullable(),
    leadId: uuid.nullable(),
    status: z.enum(["active", "archived"]),
    position: z.number().finite(),
  })
  .partial();

/* ------------------------------ labels ---------------------------------- */

export const labelCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: hexColor.default("#66757C"),
});

/* --------------------------- workspace/members --------------------------- */

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(2, "Give your workspace a name").max(60),
  seedStarter: z.boolean().default(false),
});

export const workspaceSettingsSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  staleDays: z.number().int().min(2).max(30).optional(),
  customColumn: z.object({ name: z.string().trim().min(1).max(30) }).nullable().optional(),
  whatsappDoorbell: z.boolean().optional(),
});

export const inviteCreateSchema = z.object({
  email: z.email("That email doesn't look right").transform((e) => e.toLowerCase()),
  role: invitableRoleSchema.default("member"),
});

export const memberRoleSchema = z.object({
  role: invitableRoleSchema,
});

/* ------------------------------ capture/AI ------------------------------- */

export const extractRequestSchema = z.object({
  transcript: z.string().trim().min(1).max(12_000),
  source: z.enum(["voice", "quickadd"]).default("voice"),
});

const confidence = z.enum(["high", "medium", "low"]);

/** Strict shape the AI must return; invalid output is rejected and retried once. */
export const taskProposalSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(5_000).default(""),
  projectId: uuid.nullable().default(null),
  projectConfidence: confidence.default("low"),
  assigneeId: uuid.nullable().default(null),
  assigneeConfidence: confidence.default("low"),
  dueDate: dayString.nullable().default(null),
  dueDateConfidence: confidence.default("low"),
  priority: prioritySchema.default("none"),
  priorityConfidence: confidence.default("low"),
});

export const extractionResultSchema = z.object({
  proposals: z.array(taskProposalSchema).max(30),
});

export const captureConfirmSchema = z.object({
  tasks: z
    .array(
      taskCreateSchema.extend({
        projectId: uuid, // required on confirm, review UI forces a choice
      }),
    )
    .min(1)
    .max(30),
});

/* ------------------------------ notifications ---------------------------- */

export const notificationPrefsSchema = z.record(
  z.string(),
  z.object({
    inapp: z.boolean().optional(),
    push: z.boolean().optional(),
    email: z.boolean().optional(),
  }),
);

export const pushSubscribeSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().max(400).optional(),
});

/* ------------------------------ billing ---------------------------------- */

export const checkoutSchema = z.object({
  plan: z.enum(["team", "studio"]),
  billing: z.enum(["monthly", "annual"]).default("monthly"),
});

/* ---------------------------- private tasks ------------------------------- */

export const privateTaskCreateSchema = z.object({
  /** Client-generated for offline-first creates; server generates if absent. */
  id: uuid.optional(),
  title: z.string().trim().min(1, "Give it a title").max(500),
  note: z.string().max(5_000).default(""),
  dueDate: dayString.nullish(),
});

export const privateTaskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    note: z.string().max(5_000),
    dueDate: dayString.nullable(),
    done: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

/** Promotion turns a private item into an ordinary, team-visible task. */
export const privateTaskPromoteSchema = z.object({
  projectId: uuid,
  assigneeId: uuid.nullish(),
  dueDate: dayString.nullish(),
});

/* ------------------------------ meetings ---------------------------------- */

/**
 * Hard caps regardless of plan: 2 hours, 50 MB. The byte cap mirrors the
 * storage bucket's Supabase Free-tier ceiling (see server/storage.ts); an
 * in-app recording (32 kbps opus) reaches ~29 MB at the 2 hour mark.
 */
export const MEETING_MAX_SECONDS = 7_200;
export const MEETING_MAX_BYTES = 52_428_800;

export const meetingBeginSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1).max(200).default("Meeting"),
  mime: z.string().trim().min(3).max(100),
  sizeBytes: z.number().int().min(1).max(MEETING_MAX_BYTES),
  durationSec: z.number().int().min(1).max(MEETING_MAX_SECONDS),
  projectId: uuid.nullable().optional(),
});

export const meetingPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    visibility: z.enum(["private", "workspace"]),
    projectId: uuid.nullable(),
    /** Speaker index -> display name; max 32 speakers is plenty. */
    speakerNames: z
      .record(z.string().regex(/^\d{1,2}$/), z.string().trim().min(1).max(60))
      .refine((r) => Object.keys(r).length <= 32, "Too many speakers"),
  })
  .partial();

/** Platforms a notetaker bot can join in M3. */
export const MEETING_URL_PATTERN =
  /^https:\/\/([\w-]+\.)*(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com)\//i;

export const meetingBotSchema = z.object({
  meetingUrl: z
    .url()
    .max(2_000)
    .refine(
      (u) => MEETING_URL_PATTERN.test(u),
      "Paste a Zoom, Google Meet or Microsoft Teams link",
    ),
  title: z.string().trim().min(1).max(200).default("Meeting"),
  projectId: uuid.nullable().optional(),
});

export const meetingEmailSchema = z.object({
  memberIds: z.array(uuid).min(1).max(25),
});

export const meetingItemSchema = z.object({
  index: z.number().int().min(0).max(99),
  action: z.enum(["accept", "dismiss"]),
  edits: z
    .object({
      title: z.string().trim().min(1).max(500),
      assigneeId: uuid.nullable(),
      dueDate: dayString.nullable(),
      projectId: uuid,
    })
    .partial()
    .optional(),
});

/** Strict shape the meeting summarizer must return (forced tool call). */
export const meetingSummarySchema = z.object({
  tldr: z.string().trim().min(1).max(2_000),
  decisions: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  risks: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  actionItems: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(500),
        note: z.string().max(2_000).nullable().default(null),
        assigneeId: uuid.nullable().default(null),
        assigneeName: z.string().max(200).nullable().default(null),
        dueDate: dayString.nullable().default(null),
        projectId: uuid.nullable().default(null),
      }),
    )
    .max(30)
    .default([]),
});
