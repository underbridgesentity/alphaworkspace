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

/** A plain "- item" bullet, i.e. one that ISN'T already a checkbox. */
const PLAIN_BULLET = /^(\s*)- (?!\[( |x|X)\]\s)(.*\S.*)$/;

/**
 * True when the text has plain bullets and so could become tickable steps.
 * Someone who types "- Step 1" reasonably expects to tick it; this is what
 * lets the UI offer that instead of silently leaving a dead bullet.
 */
export function hasPlainBullets(text: string | null | undefined): boolean {
  if (!text) return false;
  return text.split("\n").some((line) => PLAIN_BULLET.test(line));
}

/** Turn plain "- item" bullets into "- [ ] item". Real checkboxes are left alone. */
export function bulletsToSteps(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const m = line.match(PLAIN_BULLET);
      return m ? `${m[1]}- [ ] ${m[3]}` : line;
    })
    .join("\n");
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
