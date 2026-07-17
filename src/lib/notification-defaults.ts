/**
 * Default channel matrix per notification type. Quiet by design: the point
 * of Alpha is fewer pings, so only genuinely useful nudges default on.
 * Users override per type/channel in settings (users.notification_prefs).
 */
import type { NotificationType } from "@/lib/types";

export interface ChannelDefaults {
  push: boolean;
  email: boolean;
}

const MATRIX: Record<NotificationType, ChannelDefaults> = {
  task_assigned: { push: true, email: false },
  task_due_soon: { push: true, email: false }, // one daily sweep, not per task
  task_overdue: { push: true, email: false }, // ditto
  comment_added: { push: true, email: false },
  mentioned: { push: true, email: true }, // being named is the one email-worthy ping
  narrative_ready: { push: true, email: true }, // the Monday flagship
  morning_brief: { push: false, email: false }, // opt-in
};

export function defaultChannelsFor(type: NotificationType): ChannelDefaults {
  return MATRIX[type] ?? { push: false, email: false };
}
