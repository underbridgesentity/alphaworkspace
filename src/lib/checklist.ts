/**
 * Checklist progress from a task description. Client-safe, pure.
 *
 * Must stay in lockstep with the line regex in
 * components/app/rich-text.tsx, the renderer is the source of truth for
 * what counts as a checkbox.
 */
const CHECK_LINE = /^(\s*)- \[( |x|X)\]\s(.*)$/;

export interface ChecklistProgress {
  done: number;
  total: number;
}

/** null when the text contains no checklist lines at all. */
export function checklistProgress(
  text: string | null | undefined,
): ChecklistProgress | null {
  if (!text || !text.includes("- [")) return null; // cheap pre-filter
  let done = 0;
  let total = 0;
  for (const line of text.split("\n")) {
    const m = line.match(CHECK_LINE);
    if (!m) continue;
    total++;
    if (m[2].toLowerCase() === "x") done++;
  }
  return total > 0 ? { done, total } : null;
}
