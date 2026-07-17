import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { archiveScorecard, upsertScorecardEntry } from "@/server/dal/scorecards";
import { scorecardEntrySchema } from "@/lib/validators";

/** Upsert one period's value. */
export const PUT = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, scorecardEntrySchema);
  const entry = await upsertScorecardEntry(ctx, params.cardId, input);
  return json({ entry });
});

/** Archive (the entries stay). */
export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await archiveScorecard(ctx, params.cardId);
  return json({ ok: true });
});
