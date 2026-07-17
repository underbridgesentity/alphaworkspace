/**
 * Workspace context, the only door into tenant data.
 *
 * Every DAL function takes a `Ctx` produced by `resolveCtx()`, which verifies
 * the calling user's membership of the workspace. Queries inside the DAL
 * always filter by `ctx.workspace.id`. Nothing else may touch the db.
 */
import { and, eq, or } from "drizzle-orm";
import type { Db } from "@/server/db";
import {
  memberships,
  workspaces,
  type EntitlementsSnapshot,
  type WorkspaceSettings,
} from "@/server/db/schema";
import {
  entitlementsFor,
  type Entitlements,
  type Feature,
  type PlanId,
} from "@/lib/plans";
import { ROLE_RANK, type Role } from "@/lib/types";
import { ForbiddenError, LimitError, NotFoundError } from "./errors";

export interface CtxWorkspace {
  id: string;
  name: string;
  slug: string;
  plan: PlanId;
  entitlements: EntitlementsSnapshot | null;
  settings: WorkspaceSettings;
}

export interface Ctx {
  db: Db;
  userId: string;
  role: Role;
  workspace: CtxWorkspace;
}

/**
 * Resolve a workspace context for a user by slug or id.
 * Throws NotFoundError when the workspace doesn't exist OR the user is not a
 * member, deliberately indistinguishable from the outside.
 */
export async function resolveCtx(
  db: Db,
  userId: string,
  slugOrId: string,
): Promise<Ctx> {
  const rows = await db
    .select({
      role: memberships.role,
      workspace: workspaces,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(
      and(
        eq(memberships.userId, userId),
        or(eq(workspaces.slug, slugOrId), eq(workspaces.id, slugOrId)),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) throw new NotFoundError("Workspace not found");

  return {
    db,
    userId,
    role: row.role,
    workspace: {
      id: row.workspace.id,
      name: row.workspace.name,
      slug: row.workspace.slug,
      plan: row.workspace.plan,
      entitlements: row.workspace.entitlements ?? null,
      settings: row.workspace.settings ?? {},
    },
  };
}

/** Throw unless the caller holds `min` role or better. */
export function assertRole(ctx: Ctx, min: Role): void {
  if (ROLE_RANK[ctx.role] < ROLE_RANK[min]) {
    throw new ForbiddenError(
      min === "owner"
        ? "Only the workspace owner can do that"
        : "You need admin access to do that",
    );
  }
}

/** Effective entitlements for the workspace (snapshot wins over plan config). */
export function ctxEntitlements(ctx: Ctx): Entitlements {
  return entitlementsFor(ctx.workspace.plan, ctx.workspace.entitlements);
}

/** Gate a plan feature; throws the friendly upgrade-prompt error when off. */
export function assertFeature(ctx: Ctx, feature: Feature, what: string): void {
  if (!ctxEntitlements(ctx).features.includes(feature)) {
    throw new LimitError("feature", `${what} comes with the Studio plan`);
  }
}
