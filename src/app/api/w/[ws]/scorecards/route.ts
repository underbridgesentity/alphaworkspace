import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { createScorecard, listScorecards } from "@/server/dal/scorecards";
import { scorecardCreateSchema } from "@/lib/validators";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ scorecards: await listScorecards(ctx) });
});

export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, scorecardCreateSchema);
  const scorecard = await createScorecard(ctx, input);
  return json({ scorecard }, { status: 201 });
});
