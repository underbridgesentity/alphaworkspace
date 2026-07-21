/**
 * Checklist progress parser, must count exactly what rich-text renders as
 * a checkbox (same line regex), nothing more.
 */
import { describe, expect, it } from "vitest";
import { checklistProgress } from "@/lib/checklist";

describe("checklistProgress", () => {
  it("counts done and total across checked variants", () => {
    const text = [
      "Steps for the launch:",
      "- [ ] Draft the copy",
      "- [x] Book the venue",
      "- [X] Confirm the caterer",
      "  - [ ] indented step counts too",
      "",
      "Notes afterwards.",
    ].join("\n");
    expect(checklistProgress(text)).toEqual({ done: 2, total: 4 });
  });

  it("returns null when there is no checklist", () => {
    expect(checklistProgress("")).toBeNull();
    expect(checklistProgress(null)).toBeNull();
    expect(checklistProgress(undefined)).toBeNull();
    expect(checklistProgress("just prose with a - dash")).toBeNull();
    // Near-misses that rich-text would NOT render as checkboxes:
    expect(checklistProgress("-[ ] missing space after dash")).toBeNull();
    expect(checklistProgress("- [y] not a check state")).toBeNull();
    expect(checklistProgress("- [ ]no space after bracket")).toBeNull();
  });

  it("handles an all-done list", () => {
    expect(checklistProgress("- [x] a\n- [X] b")).toEqual({ done: 2, total: 2 });
  });
});
