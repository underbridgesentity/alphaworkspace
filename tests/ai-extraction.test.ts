/**
 * Extraction layer tests: the SA date parser, the deterministic heuristic
 * (the keyless/fallback path), schema validation of AI output, and the
 * prompt's anti-fabrication guardrails. No network, no Anthropic calls.
 */
import { describe, expect, it } from "vitest";
import { heuristicExtract, parseNaturalDay } from "@/server/ai/heuristic";
import {
  buildExtractionPrompt,
  type ExtractionContext,
} from "@/server/ai/extraction";
import { extractionResultSchema } from "@/lib/validators";
import { checkRateLimit, resetRateLimits } from "@/server/ai/ratelimit";

// 2026-07-16 is a Thursday.
const TODAY = "2026-07-16";

const LIBERTY = "11111111-1111-4111-8111-111111111111";
const VODACOM = "22222222-2222-4222-8222-222222222222";
const THABO = "33333333-3333-4333-8333-333333333333";
const NALEDI = "44444444-4444-4444-8444-444444444444";

const context: ExtractionContext = {
  projects: [
    { id: LIBERTY, name: "Liberty Two Degrees rebrand", clientName: "Liberty" },
    { id: VODACOM, name: "Vodacom retainer", clientName: "Vodacom" },
  ],
  members: [
    { id: THABO, name: "Thabo Nkosi", email: "thabo@studio.co.za" },
    { id: NALEDI, name: "Naledi Dlamini", email: "naledi@studio.co.za" },
  ],
  labels: [],
  today: TODAY,
  timezone: "Africa/Johannesburg",
};

describe("parseNaturalDay (SAST)", () => {
  const cases: [string, string | null][] = [
    ["today", "2026-07-16"],
    ["tomorrow", "2026-07-17"],
    ["day after tomorrow", "2026-07-18"],
    ["friday", "2026-07-17"],
    ["thursday", "2026-07-16"], // today counts
    ["monday", "2026-07-20"],
    ["next week", "2026-07-20"],
    ["next week tuesday", "2026-07-21"],
    ["next friday", "2026-07-24"],
    ["end of month", "2026-07-31"],
    ["month end", "2026-07-31"],
    ["in 3 days", "2026-07-19"],
    ["21 july", "2026-07-21"],
    ["july 21", "2026-07-21"],
    ["21 jul", "2026-07-21"],
    ["21/07", "2026-07-21"],
    ["3 january", "2027-01-03"], // already past → next year
    ["whenever you feel like it", null],
  ];
  for (const [phrase, expected] of cases) {
    it(`parses "${phrase}" → ${expected}`, () => {
      expect(parseNaturalDay(phrase, TODAY)).toBe(expected);
    });
  }
});

describe("heuristic quick-add", () => {
  it('parses "homepage concepts for Liberty, Thabo, Friday"', () => {
    const result = heuristicExtract(
      { transcript: "homepage concepts for Liberty, Thabo, Friday", source: "quickadd" },
      context,
    );
    expect(result.engine).toBe("heuristic");
    expect(result.proposals).toHaveLength(1);
    const p = result.proposals[0];
    expect(p.title.toLowerCase()).toContain("homepage concepts");
    expect(p.projectId).toBe(LIBERTY);
    expect(p.projectConfidence).toBe("medium");
    expect(p.assigneeId).toBe(THABO);
    expect(p.assigneeConfidence).toBe("medium");
    expect(p.dueDate).toBe("2026-07-17");
    expect(p.dueDateConfidence).toBe("medium");
    // Hint fragments consumed by matches don't pollute the title.
    expect(p.title.toLowerCase()).not.toContain("thabo");
    expect(p.title.toLowerCase()).not.toContain("friday");
  });

  it("never claims high confidence and survives unmatchable input", () => {
    const result = heuristicExtract(
      { transcript: "sort out the thing", source: "quickadd" },
      context,
    );
    const p = result.proposals[0];
    expect(p.projectId).toBeNull();
    expect(p.assigneeId).toBeNull();
    expect(p.dueDate).toBeNull();
    for (const c of [
      p.projectConfidence,
      p.assigneeConfidence,
      p.dueDateConfidence,
    ]) {
      expect(["medium", "low"]).toContain(c);
      expect(c).not.toBe("high");
    }
  });

  it("detects priority language", () => {
    const result = heuristicExtract(
      { transcript: "urgent: fix the Vodacom banner", source: "quickadd" },
      context,
    );
    expect(result.proposals[0].priority).toBe("high");
    expect(result.proposals[0].projectId).toBe(VODACOM);
  });
});

describe("heuristic voice transcripts", () => {
  it("splits a rambling transcript into multiple proposals", () => {
    const transcript =
      "Naledi must send the Vodacom report by Friday. And then homepage concepts for Liberty next week tuesday. Also book the studio for the shoot.";
    const result = heuristicExtract({ transcript, source: "voice" }, context);
    expect(result.proposals.length).toBeGreaterThanOrEqual(3);

    const report = result.proposals.find((p) =>
      p.title.toLowerCase().includes("report"),
    );
    expect(report?.assigneeId).toBe(NALEDI);
    expect(report?.projectId).toBe(VODACOM);
    expect(report?.dueDate).toBe("2026-07-17");

    const homepage = result.proposals.find((p) =>
      p.title.toLowerCase().includes("homepage"),
    );
    expect(homepage?.projectId).toBe(LIBERTY);
    expect(homepage?.dueDate).toBe("2026-07-21");
  });

  it("caps proposals at 15", () => {
    const transcript = Array.from(
      { length: 40 },
      (_, i) => `Do the thing number ${i} for the client.`,
    ).join(" ");
    const result = heuristicExtract({ transcript, source: "voice" }, context);
    expect(result.proposals.length).toBeLessThanOrEqual(15);
  });
});

describe("extraction schema (what the AI must return)", () => {
  it("rejects garbage the review UI could not render", () => {
    expect(
      extractionResultSchema.safeParse({ proposals: [{}] }).success,
    ).toBe(false);
    expect(
      extractionResultSchema.safeParse({
        proposals: [{ title: "ok", dueDate: "Friday" }],
      }).success,
    ).toBe(false);
    expect(
      extractionResultSchema.safeParse({
        proposals: [{ title: "ok", projectId: "proj_1" }],
      }).success,
    ).toBe(false);
  });

  it("accepts a minimal valid proposal and fills defaults", () => {
    const parsed = extractionResultSchema.parse({
      proposals: [{ title: "Design the thing" }],
    });
    expect(parsed.proposals[0].priority).toBe("none");
    expect(parsed.proposals[0].projectConfidence).toBe("low");
    expect(parsed.proposals[0].dueDate).toBeNull();
  });
});

describe("extraction prompt", () => {
  it("grounds the model: real ids, today's date, anti-fabrication", () => {
    const { system } = buildExtractionPrompt(
      { transcript: "x", source: "voice" },
      context,
    );
    expect(system).toContain(LIBERTY);
    expect(system).toContain(THABO);
    expect(system).toContain(TODAY);
    expect(system).toContain("NEVER fabricate");
    expect(system).toContain("NEVER invent ids");
  });

  it("switches to single-task mode for quick-add", () => {
    const { system } = buildExtractionPrompt(
      { transcript: "x", source: "quickadd" },
      context,
    );
    expect(system).toContain("exactly ONE task");
  });
});

describe("rate limiter", () => {
  it("allows the limit then blocks, and resets", () => {
    resetRateLimits();
    expect(checkRateLimit("u1", 3, 60_000)).toBe(true);
    expect(checkRateLimit("u1", 3, 60_000)).toBe(true);
    expect(checkRateLimit("u1", 3, 60_000)).toBe(true);
    expect(checkRateLimit("u1", 3, 60_000)).toBe(false);
    expect(checkRateLimit("u2", 3, 60_000)).toBe(true); // separate keys
    resetRateLimits();
    expect(checkRateLimit("u1", 3, 60_000)).toBe(true);
  });
});
