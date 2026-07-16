/**
 * Narrative + brief composer tests — the template fallback must read like a
 * person wrote it, and the prompt must forbid fabrication.
 */
import { describe, expect, it } from "vitest";
import { buildNarrativePrompt, templateNarrative } from "@/server/ai/narrative";
import { composeMorningBrief } from "@/server/ai/brief";
import type { BriefItem, WeeklySummary } from "@/lib/types";

const richWeek: WeeklySummary = {
  workspaceName: "Underbridge Studio",
  weekStart: "2026-07-06",
  weekEnd: "2026-07-12",
  totals: {
    completed: 14,
    created: 11,
    overdueNow: 4,
    staleNow: 3,
    openNow: 22,
    activeProjects: 3,
    completionRatePct: 39,
    avgCycleTimeDays: 2.4,
  },
  throughputByWeek: [
    { weekStart: "2026-06-29", completed: 9 },
    { weekStart: "2026-07-06", completed: 14 },
  ],
  members: [
    { name: "Thabo", completed: 6, open: 9, overdue: 2 },
    { name: "Naledi", completed: 5, open: 12, overdue: 1 },
    { name: "Sipho", completed: 3, open: 1, overdue: 1 },
  ],
  projects: [
    {
      name: "Liberty rebrand",
      clientName: "Liberty",
      completed: 2,
      open: 8,
      overdue: 3,
      stale: 2,
      daysSinceActivity: 6,
      dueNext: [{ title: "Client review round 1", dueDate: "2026-07-15" }],
    },
    {
      name: "Vodacom retainer",
      clientName: "Vodacom",
      completed: 12,
      open: 14,
      overdue: 1,
      stale: 1,
      daysSinceActivity: 0,
      dueNext: [{ title: "July content batch", dueDate: "2026-07-14" }],
    },
  ],
};

const quietWeek: WeeklySummary = {
  workspaceName: "Fresh Studio",
  weekStart: "2026-07-06",
  weekEnd: "2026-07-12",
  totals: {
    completed: 0,
    created: 0,
    overdueNow: 0,
    staleNow: 0,
    openNow: 0,
    activeProjects: 1,
    completionRatePct: null,
    avgCycleTimeDays: null,
  },
  throughputByWeek: [],
  members: [],
  projects: [],
};

describe("templateNarrative", () => {
  it("names names and numbers, never reads like a data dump", () => {
    const text = templateNarrative(richWeek);
    expect(text).toContain("Thabo"); // top completer, by name
    expect(text).toContain("14"); // completed count
    expect(text).toContain("Liberty rebrand"); // quiet project called out
    expect(text).toMatch(/6 days/); // with its silence duration
    expect(text.length).toBeGreaterThan(300);
    expect(text.length).toBeLessThan(2200);
    for (const junk of ["undefined", "null", "NaN", "[object"]) {
      expect(text).not.toContain(junk);
    }
  });

  it("is honest about a quiet week instead of padding", () => {
    const text = templateNarrative(quietWeek);
    expect(text.length).toBeLessThan(400);
    expect(text).not.toContain("Thabo");
    expect(text.toLowerCase()).toContain("quiet");
  });
});

describe("narrative prompt", () => {
  it("locks the model to the summary facts and the 90-second budget", () => {
    const { system, user } = buildNarrativePrompt(richWeek);
    expect(system).toContain("ONLY facts present in the JSON");
    expect(system).toContain("90 seconds");
    expect(system).toContain("Underbridge Studio");
    expect(user).toContain('"completed":14');
  });
});

describe("composeMorningBrief", () => {
  const items: BriefItem[] = [
    { taskId: "t1", title: "Fix banner", projectName: "Vodacom retainer", reason: "overdue", dueDate: "2026-07-14" },
    { taskId: "t2", title: "Send report", projectName: "Vodacom retainer", reason: "due_today", dueDate: "2026-07-16" },
    { taskId: "t3", title: "Moodboard", projectName: "Liberty rebrand", reason: "in_progress", dueDate: null },
    { taskId: "t4", title: "Extra", projectName: "Liberty rebrand", reason: "up_next", dueDate: null },
  ];

  it("keeps three things and leads with the overdue reality", () => {
    const brief = composeMorningBrief({
      userName: "Thabo Nkosi",
      items,
      overdueCount: 1,
      dueTodayCount: 1,
    });
    expect(brief.items).toHaveLength(3);
    expect(brief.headline).toContain("Thabo");
    expect(brief.headline.toLowerCase()).toContain("overdue");
    expect(brief.extras.overdueCount).toBe(1);
  });

  it("stays warm on an empty plate", () => {
    const brief = composeMorningBrief({
      userName: null,
      items: [],
      overdueCount: 0,
      dueTodayCount: 0,
    });
    expect(brief.items).toHaveLength(0);
    expect(brief.headline.length).toBeGreaterThan(10);
  });
});
