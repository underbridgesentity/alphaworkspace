import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { extractRequestSchema } from "@/lib/validators";
import { extractTasks } from "@/server/ai/extraction";
import { checkRateLimit } from "@/server/ai/ratelimit";
import { RateLimitError } from "@/server/dal/errors";
import {
  assertVoiceCaptureAvailable,
  createCapture,
} from "@/server/dal/captures";
import { listProjects } from "@/server/dal/projects";
import { listMembers } from "@/server/dal/workspaces";
import { listLabels } from "@/server/dal/labels";
import { todaySAST, TZ } from "@/lib/dates";

/**
 * Voice capture + quick-add share this brain. The AI proposes; nothing is
 * written except the capture record (kept for quality auditing). Creation
 * happens only at /captures/[id]/confirm.
 */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, extractRequestSchema);

  if (!checkRateLimit(`extract:${ctx.userId}`, 10, 60_000)) {
    throw new RateLimitError("That's a lot of captures at once, give it a minute");
  }
  if (input.source === "voice") await assertVoiceCaptureAvailable(ctx);

  const [projects, members, labels] = await Promise.all([
    listProjects(ctx),
    listMembers(ctx),
    listLabels(ctx),
  ]);

  const result = await extractTasks(input, {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      clientName: p.clientName,
    })),
    members: members.map((m) => ({ id: m.id, name: m.name, email: m.email })),
    labels,
    today: todaySAST(),
    timezone: TZ,
  });

  const capture = await createCapture(ctx, {
    transcript: input.transcript,
    source: input.source,
    extraction: { proposals: result.proposals },
    engine: result.engine,
  });

  return json({
    captureId: capture.id,
    proposals: result.proposals,
    engine: result.engine,
  });
});
