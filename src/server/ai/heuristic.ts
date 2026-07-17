/**
 * Deterministic extraction fallback. Runs when no ANTHROPIC_API_KEY is set
 * (local dev) or when the model output fails validation twice. Honest about
 * its uncertainty: nothing it infers is ever marked "high" confidence.
 */
import { addDays, todaySAST } from "@/lib/dates";
import type { ExtractionResult, TaskProposal } from "@/lib/types";
import type { ExtractionContext, ExtractionInput } from "./extraction";

const WEEKDAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];
const MONTHS = [
  "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december",
];

function weekdayIndex(day: string): number {
  // dayToDate pins to SAST midnight; derive the weekday from the ISO date.
  const d = new Date(`${day}T12:00:00+02:00`);
  return (d.getUTCDay() + 6) % 7; // Monday = 0
}

/**
 * Parse a natural-language day phrase into YYYY-MM-DD (SAST).
 * Handles: today, tomorrow, weekday names, "next <weekday>", "next week",
 * "next week <weekday>", "end of month", "in N days", "21 July", "21/07".
 */
export function parseNaturalDay(phrase: string, today = todaySAST()): string | null {
  const p = phrase.toLowerCase().trim();
  if (!p) return null;

  if (/\btoday\b|\btonight\b/.test(p)) return today;
  if (/\bday after tomorrow\b/.test(p)) return addDays(today, 2);
  if (/\btomorrow\b/.test(p)) return addDays(today, 1);
  if (/\b(end of (the )?month|month end)\b/.test(p)) {
    const [y, m] = today.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${today.slice(0, 7)}-${String(last).padStart(2, "0")}`;
  }

  const inDays = p.match(/\bin (\d{1,2}) days?\b/) ?? p.match(/^(\d{1,2}) days?$/);
  if (inDays) return addDays(today, Number(inDays[1]));

  const todayDow = weekdayIndex(today);

  // "next week tuesday" | "next week" | "next tuesday"
  const nextWeekDay = p.match(
    /\bnext week(?: on)?(?: (monday|tuesday|wednesday|thursday|friday|saturday|sunday))?\b/,
  );
  if (nextWeekDay) {
    const monday = addDays(today, 7 - todayDow);
    const target = nextWeekDay[1] ? WEEKDAYS.indexOf(nextWeekDay[1]) : 0;
    return addDays(monday, target);
  }
  const nextDay = p.match(
    /\bnext (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (nextDay) {
    const monday = addDays(today, 7 - todayDow);
    return addDays(monday, WEEKDAYS.indexOf(nextDay[1]));
  }

  // Bare weekday → upcoming occurrence (today counts).
  const bare = p.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (bare) {
    const target = WEEKDAYS.indexOf(bare[1]);
    return addDays(today, (target - todayDow + 7) % 7);
  }

  // "21 july" | "july 21" | "21 jul"
  const dm =
    p.match(/\b(\d{1,2})(?:st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/) ??
    p.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dm) {
    const dayNum = Number(/^\d/.test(dm[1]) ? dm[1] : dm[2]);
    const monthToken = /^\d/.test(dm[1]) ? dm[2] : dm[1];
    const month = MONTHS.findIndex((m) => m.startsWith(monthToken)) + 1;
    if (month > 0 && dayNum >= 1 && dayNum <= 31) {
      const year = Number(today.slice(0, 4));
      let candidate = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      if (candidate < today) candidate = `${year + 1}${candidate.slice(4)}`;
      return candidate;
    }
  }

  // "21/07" (dd/mm. SA convention)
  const slash = p.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slash) {
    const dayNum = Number(slash[1]);
    const month = Number(slash[2]);
    if (month >= 1 && month <= 12 && dayNum >= 1 && dayNum <= 31) {
      const year = Number(today.slice(0, 4));
      let candidate = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      if (candidate < today) candidate = `${year + 1}${candidate.slice(4)}`;
      return candidate;
    }
  }

  return null;
}

/** All date-ish fragments we try against parseNaturalDay, longest first. */
const DATE_PATTERN = new RegExp(
  [
    "next week(?: on)?(?: (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))?",
    "next (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
    "day after tomorrow",
    "end of (?:the )?month",
    "month end",
    "in \\d{1,2} days?",
    "\\d{1,2}(?:st|nd|rd|th)? (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*",
    "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \\d{1,2}(?:st|nd|rd|th)?",
    "\\d{1,2}/\\d{1,2}",
    "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
    "tomorrow",
    "today",
    "tonight",
  ].join("|"),
  "i",
);

function matchMember(
  segment: string,
  members: ExtractionContext["members"],
): string | null {
  const lower = segment.toLowerCase();
  let found: string | null = null;
  for (const m of members) {
    const candidates = [
      m.name?.toLowerCase(),
      m.name?.toLowerCase().split(/\s+/)[0],
      m.email.split("@")[0].toLowerCase(),
    ].filter((c): c is string => !!c && c.length >= 2);
    for (const c of candidates) {
      const re = new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(lower)) {
        if (found && found !== m.id) return null; // ambiguous → no guess
        found = m.id;
        break;
      }
    }
  }
  return found;
}

function matchProject(
  segment: string,
  projects: ExtractionContext["projects"],
): string | null {
  const lower = segment.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const p of projects) {
    for (const token of [p.name, p.clientName ?? ""]) {
      const t = token.trim().toLowerCase();
      if (t.length < 3) continue;
      // Try the full token, then meaningful words of it.
      const words = [t, ...t.split(/[\s-–-]+/).filter((w) => w.length >= 4)];
      for (const w of words) {
        if (lower.includes(w) && (!best || w.length > best.len)) {
          best = { id: p.id, len: w.length };
        }
      }
    }
  }
  return best?.id ?? null;
}

function detectPriority(segment: string): TaskProposal["priority"] {
  if (/\b(urgent|asap|immediately|right away|critical)\b/i.test(segment)) return "high";
  if (/\b(important|priority|high priority)\b/i.test(segment)) return "med";
  return "none";
}

function cleanTitle(segment: string): string {
  let t = segment
    .replace(DATE_PATTERN, " ")
    .replace(/\b(by|on|before|due)\s*$/i, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;.-]+|[\s,;.-]+$/g, "")
    .trim();
  if (t.length > 90) t = `${t.slice(0, 87).trimEnd()}…`;
  return t;
}

export function heuristicExtract(
  input: ExtractionInput,
  context: ExtractionContext,
): ExtractionResult {
  const today = context.today;
  const transcript = input.transcript.trim();

  const segments =
    input.source === "quickadd"
      ? [transcript]
      : transcript
          .split(/(?:\n+|(?<=[.!?])\s+|;\s*|\band then\b|\bthen\b(?=\s+[a-z]))/i)
          .map((s) => s.trim())
          .filter((s) => s.length > 3)
          .slice(0, 15);

  const proposals: TaskProposal[] = [];

  for (const segment of segments.length > 0 ? segments : [transcript]) {
    const assigneeId = matchMember(segment, context.members);
    const projectId = matchProject(segment, context.projects);
    const dateMatch = segment.match(DATE_PATTERN);
    const dueDate = dateMatch ? parseNaturalDay(dateMatch[0], today) : null;
    const priority = detectPriority(segment);

    // For quick-add, comma-separated tail hints ("…, Thabo, Friday") are
    // hints, not title content, strip fully-consumed hint fragments.
    let titleSource = segment;
    if (input.source === "quickadd") {
      const parts = segment.split(",").map((s) => s.trim());
      if (parts.length > 1) {
        const kept = [parts[0]];
        for (const part of parts.slice(1)) {
          const consumed =
            (dateMatch && parseNaturalDay(part, today) !== null) ||
            (assigneeId && matchMember(part, context.members) === assigneeId) ||
            (projectId && matchProject(part, context.projects) === projectId);
          if (!consumed) kept.push(part);
        }
        titleSource = kept.join(", ");
      }
    }

    const title = cleanTitle(titleSource) || cleanTitle(transcript) || "New task";

    proposals.push({
      title,
      description: "",
      projectId,
      projectConfidence: projectId ? "medium" : "low",
      assigneeId,
      assigneeConfidence: assigneeId ? "medium" : "low",
      dueDate,
      dueDateConfidence: dueDate ? "medium" : "low",
      priority,
      priorityConfidence: priority !== "none" ? "medium" : "low",
    });
  }

  return { proposals, engine: "heuristic" };
}
