/**
 * Date helpers pinned to Africa/Johannesburg (SAST, UTC+2, no DST).
 * All product-facing day logic (due dates, "today", weeks) runs through here.
 * Client-safe.
 */

export const TZ = "Africa/Johannesburg";

/** YYYY-MM-DD for a Date in SAST. */
export function toDayString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todaySAST(now: Date = new Date()): string {
  return toDayString(now);
}

/** Parse YYYY-MM-DD as midnight SAST (stable across environments). */
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00+02:00`);
}

export function addDays(day: string, n: number): string {
  const d = dayToDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDayString(d);
}

/** Difference in whole days (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((dayToDate(b).getTime() - dayToDate(a).getTime()) / 86_400_000);
}

/** Monday of the week containing `day` (weeks start Monday). */
export function weekStart(day: string): string {
  const d = dayToDate(day);
  // getUTCDay on a +02:00-midnight date reflects the SAST weekday at 22:00 UTC
  // the previous day — normalise via the formatted weekday instead.
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
  }).format(d);
  const offsets: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  return addDays(day, -offsets[weekday]);
}

export function isOverdue(dueDate: string | null, today = todaySAST()): boolean {
  return dueDate !== null && dueDate < today;
}

export function isDueToday(dueDate: string | null, today = todaySAST()): boolean {
  return dueDate !== null && dueDate === today;
}

/** "Mon 21 Jul" style short label. */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(dayToDate(day));
}

/** Relative label for due dates: Today, Tomorrow, Mon 21 Jul, 3d overdue. */
export function dueLabel(dueDate: string | null, today = todaySAST()): string {
  if (!dueDate) return "";
  const diff = diffDays(today, dueDate);
  if (diff < 0) return `${-diff}d overdue`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return formatDay(dueDate);
}

export function timeAgo(iso: string | Date, now: Date = new Date()): string {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const s = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDay(toDayString(then));
}
