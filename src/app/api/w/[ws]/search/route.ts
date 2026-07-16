import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { search } from "@/server/dal/search";

export const GET = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json(await search(ctx, q.slice(0, 200)));
});
