/**
 * Shared domain types. Client-safe (no server imports).
 */

export type Role = "owner" | "admin" | "member";
export type TaskStatus = "todo" | "in_progress" | "done" | "custom";
export type Priority = "none" | "low" | "med" | "high";
export type PlanBilling = "monthly" | "annual";

export const ROLE_RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1 };

/** Append-only activity log event types. Adding one is free (text column). */
export const ACTIVITY_TYPES = [
  "task_created",
  "task_updated",
  "task_status_changed",
  "task_assigned",
  "task_completed",
  "task_reopened",
  "task_deleted",
  "comment_added",
  "attachment_added",
  "project_created",
  "project_updated",
  "project_archived",
  "member_joined",
  "member_left",
  "capture_confirmed",
  "plan_changed",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const NOTIFICATION_TYPES = [
  "task_assigned",
  "task_due_soon",
  "task_overdue",
  "comment_added",
  "mentioned",
  "narrative_ready",
  "morning_brief",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationChannel = "inapp" | "push" | "email";

/* ------------------------------ DTOs ------------------------------------ */

export interface UserLite {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface LabelDTO {
  id: string;
  name: string;
  color: string;
}

export interface TaskDTO {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId: string | null;
  assignee: UserLite | null;
  dueDate: string | null; // YYYY-MM-DD
  priority: Priority;
  position: number;
  labels: LabelDTO[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  recurrence: { freq: "daily" | "weekly" | "monthly"; interval?: number } | null;
  /** Populated on cross-project views (My Work, search, calendar). */
  projectName?: string;
  projectColor?: string;
}

export interface AttachmentDTO {
  id: string;
  taskId: string;
  name: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
  uploader: UserLite | null;
}

export interface ProjectDTO {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  status: "active" | "archived";
  clientName: string | null;
  leadId: string | null;
  /** Present on list/get reads; the person accountable for the project. */
  lead?: UserLite | null;
  position: number;
  openCount?: number;
  overdueCount?: number;
}

export interface CommentDTO {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  author: UserLite;
  /** Aggregated per emoji; `mine` marks the viewer's own reaction. */
  reactions?: CommentReactionDTO[];
}

export interface CommentReactionDTO {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface ActivityDTO {
  id: string;
  type: ActivityType;
  data: Record<string, unknown>;
  createdAt: string;
  actor: UserLite | null;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  workspaceId: string;
}

export interface MemberDTO extends UserLite {
  role: Role;
  membershipId: string;
  joinedAt: string;
  openTasks?: number;
}

export interface WorkspaceDTO {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "team" | "studio";
  role: Role;
  settings: {
    staleDays?: number;
    customColumn?: { name: string } | null;
    whatsappDoorbell?: boolean;
    timezone?: string;
  };
}

/* --------------------------- AI extraction ------------------------------ */

export type Confidence = "high" | "medium" | "low";

/**
 * One proposed task from voice/quick-add extraction. Field-level confidence
 * lets the review UI highlight guesses. The service never writes to the
 * database, confirmation does.
 */
export interface TaskProposal {
  title: string;
  description: string;
  projectId: string | null;
  projectConfidence: Confidence;
  assigneeId: string | null;
  assigneeConfidence: Confidence;
  dueDate: string | null; // YYYY-MM-DD in Africa/Johannesburg
  dueDateConfidence: Confidence;
  priority: Priority;
  priorityConfidence: Confidence;
}

export interface ExtractionResult {
  proposals: TaskProposal[];
  engine: string; // model id or "heuristic"
}

/* ------------------------ reporting (flagship) --------------------------- */

/** Compact structured summary compiled from ActivityEvent for the narrative. */
export interface WeeklySummary {
  workspaceName: string;
  weekStart: string;
  weekEnd: string;
  totals: {
    completed: number;
    created: number;
    overdueNow: number;
    staleNow: number;
    openNow: number;
    activeProjects: number;
    completionRatePct: number | null;
    avgCycleTimeDays: number | null;
  };
  throughputByWeek: { weekStart: string; completed: number }[];
  members: {
    name: string;
    completed: number;
    open: number;
    overdue: number;
  }[];
  projects: {
    name: string;
    clientName: string | null;
    completed: number;
    open: number;
    overdue: number;
    stale: number;
    daysSinceActivity: number | null;
    dueNext: { title: string; dueDate: string }[];
  }[];
  /** Studio: manually tracked business numbers for the week (Phase 2). */
  scorecards?: {
    name: string;
    unit: string;
    value: number | null;
    target: number | null;
  }[];
  /** Studio: minutes logged this week (Phase 2). */
  timeLoggedMinutes?: number;
}

export interface BriefItem {
  taskId: string;
  title: string;
  projectName: string;
  reason: "overdue" | "due_today" | "in_progress" | "stale" | "up_next";
  dueDate: string | null;
}

export interface MorningBriefContent {
  headline: string;
  items: BriefItem[];
  extras: { overdueCount: number; dueTodayCount: number };
}

/* ----------------------------- KPI (dashboard) --------------------------- */

export interface WorkspaceKpis {
  completionRatePct: number | null;
  completedThisWeek: number;
  createdThisWeek: number;
  overdueNow: number;
  avgCycleTimeDays: number | null;
  staleNow: number;
  openNow: number;
  memberLoad: { user: UserLite; open: number; overdue: number }[];
  throughputByWeek: { weekStart: string; completed: number }[];
  /** Completions per SAST day, oldest first (momentum blocks + streak). */
  completionsByDay: { day: string; completed: number }[];
}

/* ------------------------------ Phase 2 ---------------------------------- */

export type ScorecardUnit = "count" | "currency" | "percent" | "hours";
export type ScorecardPeriod = "weekly" | "monthly";

export interface ScorecardDTO {
  id: string;
  name: string;
  unit: ScorecardUnit;
  target: number | null;
  period: ScorecardPeriod;
  /** Oldest first, one per period that has a value. */
  entries: { periodStart: string; value: number }[];
  currentPeriodStart: string;
}

export interface RunningTimerDTO {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  startedAt: string;
}

export interface TaskTimeDTO {
  totalMinutes: number;
  byUser: { user: UserLite; minutes: number }[];
  /** The viewer's running entry on THIS task, if any. */
  running: { id: string; startedAt: string } | null;
}

export interface WeekTimeDTO {
  totalMinutes: number;
  byMember: { user: UserLite; minutes: number }[];
  byProject: { id: string; name: string; color: string; minutes: number }[];
}
