/**
 * Meeting summarizer: transcript in, {tldr, decisions, risks, actionItems}
 * out. Same discipline as extraction.ts: forced tool call for strict JSON,
 * one retry with the validation error spelled out, and it NEVER writes,
 * action items are proposals the recorder confirms one by one.
 *
 * Without ANTHROPIC_API_KEY it returns null and the meeting ships with a
 * transcript only, which is still most of the value.
 */
import Anthropic from "@anthropic-ai/sdk";
import { meetingSummarySchema } from "@/lib/validators";
import type { MeetingActionItem, MeetingSummary } from "@/lib/types";

export interface MeetingSummaryInput {
  title: string;
  transcript: string;
  utterances: { speaker: number; start: number; end: number; text: string }[];
}

export interface MeetingSummaryContext {
  projects: { id: string; name: string; clientName: string | null }[];
  members: { id: string; name: string | null; email: string }[];
  today: string; // YYYY-MM-DD in Africa/Johannesburg
  timezone: string;
}

export interface MeetingSummaryResult {
  summary: MeetingSummary;
  actionItems: MeetingActionItem[];
  engine: string;
}

const MODEL = () => process.env.AI_MODEL_MEETING ?? "claude-sonnet-5";

/** Keep the prompt inside a sane token budget for two-hour meetings. */
const TRANSCRIPT_CHAR_CAP = 120_000;

export function summarizerConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function speakerScript(input: MeetingSummaryInput): string {
  if (input.utterances.length === 0) return input.transcript;
  return input.utterances
    .map((u) => `Speaker ${u.speaker + 1}: ${u.text}`)
    .join("\n");
}

function buildPrompt(
  input: MeetingSummaryInput,
  context: MeetingSummaryContext,
): { system: string; user: string } {
  const projects = context.projects
    .map(
      (p) =>
        `- ${p.id} :: ${p.name}${p.clientName ? ` (client: ${p.clientName})` : ""}`,
    )
    .join("\n");
  const members = context.members
    .map((m) => `- ${m.id} :: ${m.name ?? m.email} <${m.email}>`)
    .join("\n");

  const system = `You summarize recorded meetings for a small South African team. The person who recorded the meeting reviews everything you produce; action items only become tasks after they confirm each one, so be useful but never invent.

Today is ${context.today} (timezone ${context.timezone}). South African context: weeks start Monday; "Friday" means the upcoming Friday; dates like 21/07 are day/month.

Workspace projects (id :: name):
${projects || "- (none yet)"}

Workspace members (id :: name):
${members || "- (none)"}

Rules:
- tldr: 2 to 4 plain sentences on what the meeting was about and where it landed. No bullet syntax, no headings.
- decisions: things the group settled ("we're going with X"). Empty array if none.
- risks: open worries, blockers or deadlines at risk that were voiced. Empty array if none.
- actionItems: concrete commitments someone made or was given (max 30). Title short and imperative. assigneeId MUST be an id copied exactly from the member list or null; put the name you actually heard in assigneeName either way. projectId MUST be an id from the project list or null. Resolve relative dates to YYYY-MM-DD using today's date, else null.
- Speaker labels are "Speaker 1", "Speaker 2"... from diarization; do not guess which member a speaker is unless they are named in the conversation.
- NEVER fabricate: no invented people, projects, dates or commitments that are not grounded in the transcript.`;

  let script = speakerScript(input);
  if (script.length > TRANSCRIPT_CHAR_CAP) {
    // Keep the head and tail; the middle of very long meetings is usually
    // status detail, while openings set agenda and endings assign work.
    const half = Math.floor(TRANSCRIPT_CHAR_CAP / 2);
    script = `${script.slice(0, half)}\n\n[... middle of a very long meeting trimmed ...]\n\n${script.slice(-half)}`;
  }

  return {
    system,
    user: `Meeting title: ${input.title}\n\nTranscript:\n${script}`,
  };
}

const SUMMARY_TOOL: Anthropic.Tool = {
  name: "summarize_meeting",
  description: "Return the meeting summary and proposed action items.",
  input_schema: {
    type: "object" as const,
    required: ["tldr"],
    properties: {
      tldr: { type: "string" },
      decisions: { type: "array", maxItems: 20, items: { type: "string" } },
      risks: { type: "array", maxItems: 20, items: { type: "string" } },
      actionItems: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" },
            note: { type: ["string", "null"] },
            assigneeId: { type: ["string", "null"] },
            assigneeName: { type: ["string", "null"] },
            dueDate: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
            projectId: { type: ["string", "null"] },
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
    max_tokens: 4096,
    temperature: 0,
    system,
    messages: [{ role: "user", content: user }],
    tools: [SUMMARY_TOOL],
    tool_choice: { type: "tool", name: "summarize_meeting" },
  });
  const tool = response.content.find((b) => b.type === "tool_use");
  return tool && tool.type === "tool_use" ? tool.input : null;
}

/**
 * Returns null when no API key is configured or the model can't produce a
 * valid summary; callers store the transcript and move on.
 */
export async function summarizeMeeting(
  input: MeetingSummaryInput,
  context: MeetingSummaryContext,
): Promise<MeetingSummaryResult | null> {
  if (!summarizerConfigured()) return null;
  if (!input.transcript.trim()) return null;

  const client = new Anthropic();
  const { system, user } = buildPrompt(input, context);

  // Ids the model is allowed to reference; anything else gets nulled.
  const memberIds = new Set(context.members.map((m) => m.id));
  const projectIds = new Set(context.projects.map((p) => p.id));

  const toResult = (raw: unknown): MeetingSummaryResult | null => {
    const parsed = meetingSummarySchema.safeParse(raw);
    if (!parsed.success) return null;
    const d = parsed.data;
    return {
      summary: { tldr: d.tldr, decisions: d.decisions, risks: d.risks },
      actionItems: d.actionItems.map((item) => ({
        ...item,
        assigneeId:
          item.assigneeId && memberIds.has(item.assigneeId)
            ? item.assigneeId
            : null,
        projectId:
          item.projectId && projectIds.has(item.projectId)
            ? item.projectId
            : null,
        status: "pending" as const,
        taskId: null,
      })),
      engine: MODEL(),
    };
  };

  try {
    const first = toResult(await callModel(client, system, user));
    if (first) return first;

    const retry = toResult(
      await callModel(
        client,
        system,
        `${user}\n\n[Your previous output was rejected by schema validation. Return a valid summary via the tool: tldr is required, ids must come from the lists or be null.]`,
      ),
    );
    if (retry) return retry;
  } catch (err) {
    console.error("[ai:meeting] summary failed, transcript-only", err);
  }
  return null;
}
