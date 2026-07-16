/**
 * Morning brief composer — "your three things today". Deterministic and
 * instant (it's computed per user per day and cached); the value is the
 * ranking, not prose flourish.
 */
import type { BriefItem, MorningBriefContent } from "@/lib/types";

export function composeMorningBrief(input: {
  userName: string | null;
  items: BriefItem[];
  overdueCount: number;
  dueTodayCount: number;
}): MorningBriefContent {
  const first = input.userName?.trim().split(/\s+/)[0];
  const hello = first ? `Morning ${first}` : "Morning";
  const { overdueCount, dueTodayCount } = input;

  let headline: string;
  if (input.items.length === 0) {
    headline = `${hello} — nothing assigned to you yet. Enjoy the runway or go claim something.`;
  } else if (overdueCount > 0 && dueTodayCount > 0) {
    headline = `${hello} — ${overdueCount} overdue need${overdueCount === 1 ? "s" : ""} a decision, then today's ${dueTodayCount} deadline${dueTodayCount === 1 ? "" : "s"}.`;
  } else if (overdueCount > 0) {
    headline = `${hello} — clear ${overdueCount === 1 ? "the overdue task" : `${overdueCount} overdue tasks`} first and the rest of the day is yours.`;
  } else if (dueTodayCount > 0) {
    headline = `${hello} — ${dueTodayCount} due today. Start there.`;
  } else {
    headline = `${hello} — no fires. Three things that move the week forward:`;
  }

  return {
    headline,
    items: input.items.slice(0, 3),
    extras: { overdueCount, dueTodayCount },
  };
}
