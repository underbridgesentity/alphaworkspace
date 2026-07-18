/**
 * Alpha Workspace schema. Single source of truth for the database.
 *
 * Conventions:
 * - IDs are client-generatable UUIDs (offline-first creates).
 * - Everything tenant-owned carries workspace_id, even when reachable via a
 *   parent, so the DAL can scope every query in one hop and indexes stay hot.
 * - activity_events is append-only and powers KPIs + the weekly narrative.
 * - Phase 2 tables (kpi_*, time_entries, notes) ship now, UI later.
 */
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull();

/* ----------------------------- enums ----------------------------------- */

// Extensible: Phase 3 adds a client (read/comment-only) role via migration.
export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
]);

export const projectStatus = pgEnum("project_status", ["active", "archived"]);

// "custom" backs the optional per-workspace fourth column (workspace.settings).
export const taskStatus = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
  "custom",
]);

export const taskPriority = pgEnum("task_priority", [
  "none",
  "low",
  "med",
  "high",
]);

export const planId = pgEnum("plan_id", ["free", "team", "studio"]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "pending",
  "active",
  "past_due",
  "cancelled",
]);

export const captureStatus = pgEnum("capture_status", [
  "draft",
  "confirmed",
  "discarded",
]);

export const kpiPeriod = pgEnum("kpi_period", ["weekly", "monthly"]);

/* ------------------------- auth (Auth.js) ------------------------------- */

export type NotificationChannelPrefs = {
  inapp?: boolean;
  push?: boolean;
  email?: boolean;
};
/** Keyed by NotificationType; missing keys fall back to defaults in code. */
export type NotificationPrefs = Record<string, NotificationChannelPrefs>;

export const users = pgTable("users", {
  id: id(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", {
    withTimezone: true,
    mode: "date",
  }),
  /** bcrypt hash; null = passwordless account (magic link / Google only). */
  passwordHash: text("password_hash"),
  image: text("image"),
  notificationPrefs: jsonb("notification_prefs")
    .$type<NotificationPrefs>()
    .default({})
    .notNull(),
  /** Platform operator (Alpha staff), sees the admin portal. Never tenant data. */
  isOperator: boolean("is_operator").default(false).notNull(),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("accounts_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* --------------------------- tenancy ------------------------------------ */

export type WorkspaceSettings = {
  /** Days without activity before a task counts as stale. Default 5. */
  staleDays?: number;
  /** Optional fourth board column (Phase 1 ships the setting, not a maze). */
  customColumn?: { name: string } | null;
  /** Org-level placeholder for the Phase 3 outbound-only WhatsApp doorbell. */
  whatsappDoorbell?: boolean;
  timezone?: string;
};

export type EntitlementsSnapshot = {
  maxMembers: number;
  maxActiveProjects: number | null;
  voiceCapturesPerMonth: number;
  features: string[];
};

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: planId("plan").default("free").notNull(),
  /** Snapshot taken at subscribe/change time; falls back to PLANS[plan]. */
  entitlements: jsonb("entitlements").$type<EntitlementsSnapshot | null>(),
  settings: jsonb("settings").$type<WorkspaceSettings>().default({}).notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole("role").default("member").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("memberships_ws_user_uq").on(t.workspaceId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Null email = shareable multi-use invite link. */
    email: text("email"),
    role: workspaceRole("role").default("member").notNull(),
    token: text("token").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [index("invites_ws_idx").on(t.workspaceId)],
);

/* ----------------------------- work ------------------------------------- */

export const projects = pgTable(
  "projects",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("#5B7C99").notNull(),
    status: projectStatus("status").default("active").notNull(),
    /** Plain text in Phase 1; becomes a Client entity when shared views land. */
    clientName: text("client_name"),
    /** The member accountable for the project as a whole. */
    leadId: text("lead_id").references(() => users.id, { onDelete: "set null" }),
    position: doublePrecision("position").default(0).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("projects_ws_idx").on(t.workspaceId, t.status)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Markdown-lite. Deliberately not a rich-text database. */
    description: text("description").default("").notNull(),
    status: taskStatus("status").default("todo").notNull(),
    assigneeId: text("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueDate: date("due_date"),
    priority: taskPriority("priority").default("none").notNull(),
    /** Fractional ordering within a column. */
    position: doublePrecision("position").default(0).notNull(),
    /** e.g. {freq:"weekly"}, on completion the next occurrence is created. */
    recurrence: jsonb("recurrence").$type<{
      freq: "daily" | "weekly" | "monthly";
      interval?: number;
    } | null>(),
    /** Set on tasks spawned by recurrence (parent task id). */
    recurrenceOf: text("recurrence_of"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    /** Any meaningful touch (status, comment, edit), powers staleness. */
    lastActivityAt: timestamp("last_activity_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("tasks_ws_status_idx").on(t.workspaceId, t.status),
    index("tasks_project_idx").on(t.projectId, t.status, t.position),
    index("tasks_assignee_idx").on(t.assigneeId, t.status, t.dueDate),
    index("tasks_ws_due_idx").on(t.workspaceId, t.dueDate),
  ],
);

export const labels = pgTable(
  "labels",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("#66757C").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("labels_ws_name_uq").on(t.workspaceId, t.name)],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_task_idx").on(t.taskId, t.createdAt)],
);

/**
 * Emoji reactions on comments: the cheapest possible acknowledgment, which
 * is the point, a 👍 here replaces a "thanks, noted" message. Toggling is
 * idempotent via the unique index. Deliberately no notification fan-out.
 */
export const commentReactions = pgTable(
  "comment_reactions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    commentId: text("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("comment_reactions_once").on(t.commentId, t.userId, t.emoji),
    index("comment_reactions_comment_idx").on(t.commentId),
  ],
);

/* ------------------------- activity log --------------------------------- */

/**
 * Append-only log of meaningful changes. The KPI computations and the weekly
 * narrative read exclusively from here (plus current task state), design
 * changes to this table with care.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // set null (not cascade): the log is append-only history and must survive
    // task/project deletion. KPIs and narratives are computed from it.
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    /** Null for system events (sync replays keep the original actor). */
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** ActivityType in src/lib/types.ts, kept as text so adding types is free. */
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_ws_time_idx").on(t.workspaceId, t.createdAt),
    index("activity_task_idx").on(t.taskId, t.createdAt),
    index("activity_ws_type_idx").on(t.workspaceId, t.type, t.createdAt),
  ],
);

/* ------------------------- voice capture -------------------------------- */

export const voiceCaptures = pgTable(
  "voice_captures",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").default("voice").notNull(), // "voice" | "quickadd"
    transcript: text("transcript").notNull(),
    /** Raw extraction payload as returned by the AI/heuristic, for auditing. */
    extraction: jsonb("extraction").$type<Record<string, unknown>>(),
    engine: text("engine"), // model id or "heuristic"
    status: captureStatus("status").default("draft").notNull(),
    createdTaskIds: jsonb("created_task_ids").$type<string[]>().default([]),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("captures_ws_idx").on(t.workspaceId, t.createdAt)],
);

/* ------------------------------ meetings -------------------------------- */

export const meetingStatus = pgEnum("meeting_status", [
  "uploading",
  "processing",
  "ready",
  "failed",
]);
export const meetingVisibility = pgEnum("meeting_visibility", [
  "private",
  "workspace",
]);

/**
 * Recorded meetings (M1). Audio lives in storage; the transcript, summary
 * and action-item proposals live here. PRIVATE BY DEFAULT: transcripts are
 * a different sensitivity class from tasks, so only the recorder sees a
 * meeting until they share it or link it to a project. Confirmed action
 * items become ordinary (workspace-visible) tasks; the recording itself
 * stays behind the visibility wall.
 */
export const meetings = pgTable(
  "meetings",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    title: text("title").default("Meeting").notNull(),
    visibility: meetingVisibility("visibility").default("private").notNull(),
    status: meetingStatus("status").default("uploading").notNull(),
    audioPath: text("audio_path"),
    mime: text("mime"),
    sizeBytes: integer("size_bytes").default(0).notNull(),
    durationSec: integer("duration_sec").default(0).notNull(),
    transcript: jsonb("transcript").$type<{
      text: string;
      utterances: { speaker: number; start: number; end: number; text: string }[];
    } | null>(),
    summary: jsonb("summary").$type<{
      tldr: string;
      decisions: string[];
      risks: string[];
    } | null>(),
    actionItems: jsonb("action_items")
      .$type<
        {
          title: string;
          note?: string | null;
          assigneeId?: string | null;
          assigneeName?: string | null;
          dueDate?: string | null;
          projectId?: string | null;
          status: "pending" | "accepted" | "dismissed";
          taskId?: string | null;
        }[]
      >()
      .default([])
      .notNull(),
    engine: text("engine"),
    error: text("error"),
    createdAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("meetings_ws_idx").on(t.workspaceId, t.createdAt)],
);

/* ------------------------- notifications -------------------------------- */

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** NotificationType in src/lib/types.ts. */
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    /** Delivery attempts per channel, e.g. {push: "sent", email: "skipped"}. */
    channels: jsonb("channels").$type<Record<string, string>>().default({}).notNull(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("push_subs_user_idx").on(t.userId)],
);

/* --------------------------- billing ------------------------------------ */

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    plan: planId("plan").notNull(),
    billing: text("billing").default("monthly").notNull(), // "monthly" | "annual"
    status: subscriptionStatus("status").default("pending").notNull(),
    /** Our reference sent to PayFast as m_payment_id. */
    mPaymentId: text("m_payment_id").notNull().unique(),
    /** PayFast recurring token from the first ITN; needed to cancel. */
    payfastToken: text("payfast_token"),
    amountCents: integer("amount_cents").notNull(),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
      mode: "date",
    }),
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
      mode: "date",
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    /** Last raw ITN payload, for audit/debugging. */
    lastItn: jsonb("last_itn").$type<Record<string, string>>(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("subscriptions_ws_idx").on(t.workspaceId, t.status)],
);

/* ------------------- reporting artifacts (flagship) ---------------------- */

export const narrativeReports = pgTable(
  "narrative_reports",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    weekEnd: date("week_end").notNull(),
    /** The compiled stats summary the model was prompted with (auditability). */
    inputSummary: jsonb("input_summary").$type<Record<string, unknown>>().notNull(),
    narrative: text("narrative").notNull(),
    engine: text("engine").notNull(), // model id or "template"
    /** Reader reactions, userId -> "up" | "down", tunes future prompts. */
    feedback: jsonb("feedback").$type<Record<string, "up" | "down">>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("narratives_ws_week_uq").on(t.workspaceId, t.weekStart)],
);

export const dailyBriefs = pgTable(
  "daily_briefs",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Local date in Africa/Johannesburg. */
    day: date("day").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("briefs_user_ws_day_uq").on(t.userId, t.workspaceId, t.day)],
);

/* ----------------------------- attachments ------------------------------- */

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    uploaderId: text("uploader_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Object key in the Supabase Storage "attachments" bucket. */
    storagePath: text("storage_path").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    index("attachments_task_idx").on(t.taskId),
    index("attachments_ws_idx").on(t.workspaceId),
  ],
);

/* ------------------- Phase 2 (schema now, UI later) ---------------------- */

export const kpiDefinitions = pgTable(
  "kpi_definitions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Personal scorecard subject; null = role/team-level definition. */
    subjectUserId: text("subject_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    unit: text("unit").default("count").notNull(),
    target: doublePrecision("target"),
    period: kpiPeriod("period").default("monthly").notNull(),
    /** e.g. {kind:"label", labelId} | {kind:"project", projectId} | {kind:"time_total"} */
    autoSource: jsonb("auto_source").$type<Record<string, unknown> | null>(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("kpi_defs_ws_idx").on(t.workspaceId)],
);

export const kpiEntries = pgTable(
  "kpi_entries",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    definitionId: text("definition_id")
      .notNull()
      .references(() => kpiDefinitions.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    value: doublePrecision("value").notNull(),
    source: text("source").default("manual").notNull(), // "auto" | "manual"
    enteredBy: text("entered_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("kpi_entries_def_period_uq").on(t.definitionId, t.periodStart),
  ],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    minutes: integer("minutes"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("time_ws_idx").on(t.workspaceId, t.startedAt),
    index("time_task_idx").on(t.taskId),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Null project = personal scratchpad (scoped to createdBy). */
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    title: text("title").default("").notNull(),
    body: text("body").default("").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("notes_ws_idx").on(t.workspaceId, t.projectId)],
);
