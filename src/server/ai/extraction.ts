/**
 * The extraction service — one brain behind voice capture and quick-add.
 * Takes a transcript plus workspace context, returns schema-validated task
 * proposals with per-field confidence. Never touches the database; the
 * confirm endpoint does the writing (product law: extract, show, confirm).
 *
 * With ANTHROPIC_API_KEY: Claude with a forced tool call for strict JSON,
 * one retry on invalid output, then heuristic fallback. Without: heuristic.
 */
import Anthropic from "@anthropic-ai/sdk";
import { extractionResultSchema } from "@/lib/validators";
import type { ExtractionResult } from "@/lib/types";
import { heuristicExtract } from "./heuristic";

export interface ExtractionInput {
  transcript: string;
  source: "voice" | "quickadd";
}

export interface ExtractionContext {
  projects: { id: string; name: string; clientName: string | null }[];
  members: { id: string; name: string | null; email: string }[];
  labels: { id: string; name: string }[];
  today: string; // YYYY-MM-DD in Africa/Johannesburg
  timezone: string;
}

const MODEL = () => process.env.AI_MODEL_EXTRACTION ?? "claude-haiku-4-5";

export function buildExtractionPrompt(
  input: ExtractionInput,
  context: ExtractionContext,
): { system: string; user: string } {
  const projects = context.projects
    .map((p) => `- ${p.id} :: ${p.name}${p.clientName ? ` (client: ${p.clientName})` : ""}`)
    .join("\n");
  const members = context.members
    .map((m) => `- ${m.id} :: ${m.name ?? m.email} <${m.email}>`)
    .join("\n");

  const system = `You turn spoken or typed notes from a small South African creative agency into structured task proposals. Team members review and confirm every field before anything is created, so be useful but honest about uncertainty.

Today is ${context.today} (timezone ${context.timezone}). South African context: weeks start Monday; "Friday" means the upcoming Friday; dates like 21/07 are day/month.

Workspace projects (id :: name):
${projects || "- (none yet)"}

Workspace members (id :: name):
${members || "- (none)"}

Rules:
- Split the input into distinct, actionable tasks (max 15). ${input.source === "quickadd" ? "This is a one-line quick-add: produce exactly ONE task; trailing comma-separated fragments are hints for assignee/project/date, not title content." : "A rambling voice note after a client call often contains several tasks."}
- Titles: short, imperative, specific. Leftover detail goes in description.
- projectId and assigneeId MUST be ids copied exactly from the lists above, or null. NEVER invent ids or people.
- Resolve relative dates ("Friday", "next week Tuesday", "end of month") to YYYY-MM-DD using today's date. If no date is implied, use null.
- priority: only when clearly signalled (urgent/asap → high; important → med); otherwise "none".
- Confidence per field: "high" only when stated explicitly, "medium" when inferred from strong hints, "low" when guessing. Anything you were not told is low.
- NEVER fabricate: no invented names, projects, dates or commitments that are not grounded in the input.`;

  return { system, user: input.transcript };
}

/** JSON Schema mirror of extractionResultSchema for the forced tool call. */
const PROPOSAL_TOOL: Anthropic.Tool = {
  name: "propose_tasks",
  description: "Return the extracted task proposals.",
  input_schema: {
    type: "object" as const,
    required: ["proposals"],
    properties: {
      proposals: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            projectId: { type: ["string", "null"] },
            projectConfidence: { enum: ["high", "medium", "low"] },
            assigneeId: { type: ["string", "null"] },
            assigneeConfidence: { enum: ["high", "medium", "low"] },
            dueDate: {
              type: ["string", "null"],
              description: "YYYY-MM-DD or null",
            },
            dueDateConfidence: { enum: ["high", "medium", "low"] },
            priority: { enum: ["none", "low", "med", "high"] },
            priorityConfidence: { enum: ["high", "medium", "low"] },
          },
        },
      },
    },
  },
};

async function callModel(
  client: Anthropic,
  system: string,
  user: string,
): Promise<unknown> {
  const response = await client.messages.create({
    model: MODEL(),
    max_tokens: 2048,
    temperature: 0,
    system,
    messages: [{ role: "user", content: user }],
    tools: [PROPOSAL_TOOL],
    tool_choice: { type: "tool", name: "propose_tasks" },
  });
  const tool = response.content.find((b) => b.type === "tool_use");
  return tool && tool.type === "tool_use" ? tool.input : null;
}

export async function extractTasks(
  input: ExtractionInput,
  context: ExtractionContext,
): Promise<ExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return heuristicExtract(input, context);
  }

  const client = new Anthropic();
  const { system, user } = buildExtractionPrompt(input, context);

  try {
    const first = await callModel(client, system, user);
    const parsed = extractionResultSchema.safeParse(first);
    if (parsed.success && parsed.data.proposals.length > 0) {
      return { ...parsed.data, engine: MODEL() };
    }

    // One retry with the validation error spelled out.
    const retry = await callModel(
      client,
      system,
      `${user}\n\n[Your previous output was rejected by schema validation: ${
        parsed.success ? "it contained no proposals" : parsed.error.message.slice(0, 500)
      }. Return valid proposals via the tool.]`,
    );
    const reparsed = extractionResultSchema.safeParse(retry);
    if (reparsed.success && reparsed.data.proposals.length > 0) {
      return { ...reparsed.data, engine: MODEL() };
    }
  } catch (err) {
    console.error("[ai:extract] model call failed, falling back", err);
  }

  return heuristicExtract(input, context);
}
