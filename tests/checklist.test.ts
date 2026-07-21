/**
 * Checklist progress parser, must count exactly what rich-text renders as
 * a checkbox (same line regex), nothing more.
 */
import { describe, expect, it } from "vitest";
import {
  bulletsToSteps,
  checklistProgress,
  hasPlainBullets,
} from "@/lib/checklist";

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

describe("plain bullets → tickable steps", () => {
  it("spots plain bullets that could become steps", () => {
    expect(hasPlainBullets("- Step 1\n- Step 2")).toBe(true);
    expect(hasPlainBullets("  - indented")).toBe(true);
    // Already tickable, or not a bullet at all.
    expect(hasPlainBullets("- [ ] Step 1\n- [x] Step 2")).toBe(false);
    expect(hasPlainBullets("just prose")).toBe(false);
    expect(hasPlainBullets("-nospace")).toBe(false);
    expect(hasPlainBullets("- ")).toBe(false); // empty bullet, nothing to tick
    expect(hasPlainBullets("")).toBe(false);
    expect(hasPlainBullets(null)).toBe(false);
  });

  it("converts plain bullets and leaves real checkboxes alone", () => {
    expect(bulletsToSteps("- Step 1\n- Step 2")).toBe("- [ ] Step 1\n- [ ] Step 2");
    // Mixed: the existing checkbox (and its checked state) survives untouched.
    expect(bulletsToSteps("- [x] Done already\n- New one")).toBe(
      "- [x] Done already\n- [ ] New one",
    );
    // Indentation is preserved so nesting still renders.
    expect(bulletsToSteps("  - nested")).toBe("  - [ ] nested");
    // Prose and non-bullets are untouched.
    expect(bulletsToSteps("Notes here\n- Step\nMore notes")).toBe(
      "Notes here\n- [ ] Step\nMore notes",
    );
  });

  it("the conversion produces lines the progress parser counts", () => {
    const converted = bulletsToSteps("- Step 1\n- Step 2");
    expect(checklistProgress(converted)).toEqual({ done: 0, total: 2 });
    // And converting is idempotent.
    expect(bulletsToSteps(converted)).toBe(converted);
  });
});
