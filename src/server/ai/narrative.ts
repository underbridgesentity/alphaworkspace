import "server-only";

/**
 * The weekly narrative engine, the single most important feature in the
 * product. Input is a compact, pre-computed WeeklySummary (the model never
 * sees raw data and never invents beyond it); output reads like a sharp ops
 * lead wrote it in ninety seconds of your Monday.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { WeeklySummary } from "@/lib/types";
import { anthropicClient, anthropicConfigured } from "./anthropic";

// Weekly per workspace, so volume (and cost) is tiny; a Sonnet model earns
// its keep here on the product's flagship feature. Override with AI_MODEL_NARRATIVE.
const MODEL = () => process.env.AI_MODEL_NARRATIVE ?? "claude-sonnet-4-6";

export function buildNarrativePrompt(summary: WeeklySummary): {
  system: string;
  user: string;
} {
  const system = `You are the sharp, warm, direct operations lead of a small South African creative agency, writing the Monday morning briefing for the team's workspace ("${summary.workspaceName}").

Style:
- Plain language. Specific. Name names and use the numbers ("Thabo carried 40% of completions; Sable has had nothing move in 6 days").
- Readable in 90 seconds: roughly 160–260 words, 3–5 short paragraphs.
- Structure the substance (not with headings): what got done; what's at risk or overdue; who's overloaded or quiet; what to watch this week.
- Warm but direct. No corporate filler, no pep-talk padding, no bullet spam (at most one short list), no headings, no emoji.
- South African English (organise, colour); currency is rand.

Hard rules:
- Reference ONLY facts present in the JSON summary you are given. Do not infer causes, invent examples, or mention anyone or any project not in the data.
- If the week was quiet or the data is thin, say so honestly and keep it short rather than padding.
- Numbers you cite must match the summary exactly.
- If "scorecards" is present, weave at most one sentence on the numbers that are furthest from target (or notable); if a value is null it wasn't filled in, you may nudge once, gently. If "timeLoggedMinutes" is present and > 0, you may mention the hours logged; never guilt anyone about hours.`;

  const user = `Here is this week's summary as JSON:\n\n${JSON.stringify(summary)}\n\nWrite the Monday briefing.`;
  return { system, user };
}

/**
 * Deterministic fallback used without an API key (and if the API fails).
 * Written to read like prose, not a data dump.
 */
export function templateNarrative(summary: WeeklySummary): string {
  const { totals, members, projects } = summary;
  const parts: string[] = [];

  const topMember = [...members].sort((a, b) => b.completed - a.completed)[0];
  const share =
    topMember && totals.completed > 0
      ? Math.round((topMember.completed / totals.completed) * 100)
      : 0;

  if (totals.completed === 0 && totals.created === 0) {
    parts.push(
      `A quiet week in ${summary.workspaceName}, nothing was completed and nothing new came in. If that's accurate, enjoy it; if work happened off the board, it didn't count because nobody could see it.`,
    );
  } else {
    let opener = `The team closed out ${totals.completed} task${totals.completed === 1 ? "" : "s"} this week against ${totals.created} new one${totals.created === 1 ? "" : "s"} coming in`;
    if (topMember && topMember.completed > 0 && members.length > 1) {
      opener += `. ${topMember.name} led the way with ${topMember.completed} completion${topMember.completed === 1 ? "" : "s"}${share >= 35 ? `, ${share}% of everything finished` : ""}`;
    }
    opener += `.`;
    if (totals.avgCycleTimeDays !== null) {
      opener += ` Work that finished took about ${totals.avgCycleTimeDays} day${totals.avgCycleTimeDays === 1 ? "" : "s"} from creation to done.`;
    }
    parts.push(opener);
  }

  const worries: string[] = [];
  if (totals.overdueNow > 0) {
    const worst = [...projects].sort((a, b) => b.overdue - a.overdue)[0];
    worries.push(
      `${totals.overdueNow} task${totals.overdueNow === 1 ? " is" : "s are"} past due${worst && worst.overdue > 0 ? `, most of them on ${worst.name}` : ""}`,
    );
  }
  if (totals.staleNow > 0) {
    worries.push(
      `${totals.staleNow} ha${totals.staleNow === 1 ? "sn't" : "ven't"} been touched in a while`,
    );
  }
  if (worries.length > 0) {
    parts.push(
      `Worth a look: ${worries.join(", and ")}. A two-minute pass on those beats a week of silence.`,
    );
  }

  const quiet = projects.filter(
    (p) => p.daysSinceActivity !== null && p.daysSinceActivity >= 6 && p.open > 0,
  );
  if (quiet.length > 0) {
    parts.push(
      `${quiet.map((p) => `${p.name}${p.clientName ? ` (${p.clientName})` : ""}`).join(" and ")} ${quiet.length === 1 ? "has" : "have"} gone quiet, ${quiet[0].daysSinceActivity} days without movement. Quiet client projects are how surprises happen.`,
    );
  }

  const loaded = members.filter((m) => m.open >= 8);
  if (loaded.length > 0) {
    parts.push(
      `${loaded.map((m) => `${m.name} (${m.open} open)`).join(", ")} ${loaded.length === 1 ? "is" : "are"} carrying a heavy plate, rebalance before it snaps.`,
    );
  }

  const upcoming = projects
    .flatMap((p) => p.dueNext.map((d) => ({ ...d, project: p.name })))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    .slice(0, 3);
  if (upcoming.length > 0) {
    parts.push(
      `This week's fixed points: ${upcoming
        .map((u) => `“${u.title}” (${u.project}, ${u.dueDate})`)
        .join("; ")}.`,
    );
  }

  const filled = (summary.scorecards ?? []).filter((s) => s.value !== null);
  if (filled.length > 0) {
    parts.push(
      `On the scorecards: ${filled
        .map(
          (s) =>
            `${s.name} at ${s.value}${s.target !== null ? ` against a target of ${s.target}` : ""}`,
        )
        .join("; ")}.`,
    );
  }
  if (summary.timeLoggedMinutes && summary.timeLoggedMinutes >= 60) {
    parts.push(
      `The team logged about ${Math.round(summary.timeLoggedMinutes / 60)} hours of tracked time this week.`,
    );
  }

  return parts.join("\n\n");
}

export async function composeNarrative(
  summary: WeeklySummary,
): Promise<{ narrative: string; engine: string }> {
  if (!anthropicConfigured()) {
    return { narrative: templateNarrative(summary), engine: "template" };
  }
  try {
    const client = anthropicClient();
    const { system, user } = buildNarrativePrompt(summary);
    const response = await client.messages.create({
      model: MODEL(),
      max_tokens: 1000,
      temperature: 0.4,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text.length > 40) return { narrative: text, engine: MODEL() };
  } catch (err) {
    console.error("[ai:narrative] model call failed, using template", err);
  }
  return { narrative: templateNarrative(summary), engine: "template" };
}
