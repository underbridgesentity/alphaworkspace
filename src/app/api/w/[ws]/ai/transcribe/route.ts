import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { checkRateLimit } from "@/server/ai/ratelimit";
import { RateLimitError, ValidationError } from "@/server/dal/errors";
import {
  keytermsFrom,
  transcribeAudio,
  transcriptionConfigured,
} from "@/server/ai/transcribe";
import { assertVoiceCaptureAvailable } from "@/server/dal/captures";
import { listProjects } from "@/server/dal/projects";
import { listMembers } from "@/server/dal/workspaces";
import { listLabels } from "@/server/dal/labels";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Server-side transcription with workspace keyterm biasing. The browser
 * sends the recorded audio blob; we return the transcript, then the client
 * runs it through /ai/extract as usual. Audio is never stored.
 */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);

  if (!transcriptionConfigured()) {
    // 501 so the client cleanly falls back to on-device transcription.
    return json(
      { error: { code: "not_configured", message: "Server transcription is off" } },
      { status: 501 },
    );
  }
  if (!checkRateLimit(`transcribe:${ctx.userId}`, 20, 60_000)) {
    throw new RateLimitError("Too many recordings at once, give it a minute");
  }
  await assertVoiceCaptureAvailable(ctx);

  const mime = req.headers.get("content-type") ?? "audio/webm";
  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0) throw new ValidationError("No audio received");
  if (audio.byteLength > 20 * 1024 * 1024) {
    throw new ValidationError("Recording is too long, keep captures under ~10 minutes");
  }

  const [projects, members, labels] = await Promise.all([
    listProjects(ctx),
    listMembers(ctx),
    listLabels(ctx),
  ]);
  const keyterms = keytermsFrom({
    members: members.map((m) => ({ name: m.name, email: m.email })),
    projects: projects.map((p) => ({ name: p.name, clientName: p.clientName })),
    labels,
  });

  const result = await transcribeAudio(audio, mime, { keyterms });
  return json(result);
});
