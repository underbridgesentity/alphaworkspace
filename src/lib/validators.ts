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
  position: z.number().finite().optional(),
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
    position: z.number().finite(),
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
