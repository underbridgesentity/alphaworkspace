import { z } from "zod";
import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { rateNarrative } from "@/server/dal/notifications";

const schema = z.object({ vote: z.enum(["up", "down"]).nullable() });

export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const { vote } = await readJson(req, schema);
  await rateNarrative(ctx, params.id, vote);
  return json({ ok: true });
});
