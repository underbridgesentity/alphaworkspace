/**
 * Workspace lifecycle, membership and invites.
 */
import { and, asc, count, eq, gt, gte, isNull, ne } from "drizzle-orm";
import type { Db } from "@/server/db";
import {
  invites,
  memberships,
  tasks,
  users,
  workspaces,
  type WorkspaceSettings,
} from "@/server/db/schema";
import type { MemberDTO, Role } from "@/lib/types";
import { sendEmail } from "@/server/email/send";
import { escapeHtml, renderEmail } from "@/server/email/layout";
import { assertRole, ctxEntitlements, resolveCtx, type Ctx } from "./context";
import { logActivity } from "./activity";
import { LimitError, NotFoundError, ValidationError, ForbiddenError } from "./errors";
import { seedStarterProject } from "./starter";

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/* ------------------------------ lifecycle -------------------------------- */

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export async function listWorkspacesForUser(db: Db, userId: string) {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(workspaces.createdAt));
}

export async function createWorkspace(
  db: Db,
  userId: string,
  input: { name: string; seedStarter: boolean },
): Promise<{ id: string; slug: string }> {
  const base = slugify(input.name);
  let slug = base;
  for (let i = 2; ; i++) {
    const clash = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);
    if (!clash[0]) break;
    slug = `${base}-${i}`;
    if (i > 50) throw new ValidationError("Try a different workspace name");
  }

  const [ws] = await db
    .insert(workspaces)
    .values({ name: input.name, slug, createdBy: userId })
    .returning({ id: workspaces.id, slug: workspaces.slug });

  await db.insert(memberships).values({
    workspaceId: ws.id,
    userId,
    role: "owner",
  });

  await logActivity(db, {
    workspaceId: ws.id,
    type: "member_joined",
    actorId: userId,
    data: { role: "owner" },
  });

  if (input.seedStarter) {
    const ctx = await resolveCtx(db, userId, ws.id);
    await seedStarterProject(ctx);
  }

  return ws;
}

export async function updateWorkspace(
  ctx: Ctx,
  input: { name?: string; settings?: Partial<WorkspaceSettings> },
): Promise<void> {
  assertRole(ctx, "admin");
  const next: Record<string, unknown> = {};
  if (input.name) next.name = input.name;
  if (input.settings) {
    next.settings = { ...ctx.workspace.settings, ...input.settings };
  }
  if (Object.keys(next).length === 0) return;
  await ctx.db
    .update(workspaces)
    .set(next)
    .where(eq(workspaces.id, ctx.workspace.id));
}

/** POPIA: deletion that actually deletes. FK cascades take everything. */
export async function deleteWorkspace(ctx: Ctx): Promise<void> {
  assertRole(ctx, "owner");
  await ctx.db.delete(workspaces).where(eq(workspaces.id, ctx.workspace.id));
}

/* ------------------------------ members ---------------------------------- */

export async function listMembers(ctx: Ctx): Promise<MemberDTO[]> {
  const rows = await ctx.db
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      openTasks: count(tasks.id),
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .leftJoin(
      tasks,
      and(
        eq(tasks.assigneeId, users.id),
        eq(tasks.workspaceId, ctx.workspace.id),
        ne(tasks.status, "done"),
      ),
    )
    .where(eq(memberships.workspaceId, ctx.workspace.id))
    .groupBy(memberships.id, users.id)
    .orderBy(asc(memberships.joinedAt));

  return rows.map((r) => ({
    membershipId: r.membershipId,
    role: r.role,
    joinedAt: r.joinedAt.toISOString(),
    id: r.id,
    name: r.name,
    email: r.email,
    image: r.image,
    openTasks: r.openTasks,
  }));
}

async function memberCount(ctx: Ctx): Promise<number> {
  const [row] = await ctx.db
    .select({ n: count() })
    .from(memberships)
    .where(eq(memberships.workspaceId, ctx.workspace.id));
  return row?.n ?? 0;
}

export async function changeMemberRole(
  ctx: Ctx,
  membershipId: string,
  role: Extract<Role, "admin" | "member">,
): Promise<void> {
  assertRole(ctx, "admin");
  const [target] = await ctx.db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.workspaceId, ctx.workspace.id),
      ),
    );
  if (!target) throw new NotFoundError("Member not found");
  if (target.role === "owner") {
    throw new ForbiddenError("The owner's role can't be changed here");
  }
  await ctx.db
    .update(memberships)
    .set({ role })
    .where(eq(memberships.id, membershipId));
}

export async function removeMember(ctx: Ctx, membershipId: string): Promise<void> {
  const [target] = await ctx.db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.workspaceId, ctx.workspace.id),
      ),
    );
  if (!target) throw new NotFoundError("Member not found");
  if (target.role === "owner") {
    throw new ForbiddenError("The owner can't be removed");
  }
  // Members may remove themselves (leave); removing others needs admin.
  if (target.userId !== ctx.userId) assertRole(ctx, "admin");

  await ctx.db.delete(memberships).where(eq(memberships.id, membershipId));
  await logActivity(ctx.db, {
    workspaceId: ctx.workspace.id,
    type: "member_left",
    actorId: ctx.userId,
    data: { userId: target.userId },
  });
}

/* ------------------------------ invites ---------------------------------- */

export async function listInvites(ctx: Ctx) {
  assertRole(ctx, "admin");
  return ctx.db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(
      and(
        eq(invites.workspaceId, ctx.workspace.id),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invites.createdAt));
}

/** A single reusable link anyone can use to join (admin-created, revocable). */
export async function createInviteLink(
  ctx: Ctx,
  role: "admin" | "member",
): Promise<{ token: string; url: string }> {
  assertRole(ctx, "admin");
  const token = crypto.randomUUID().replace(/-/g, "");
  await ctx.db.insert(invites).values({
    workspaceId: ctx.workspace.id,
    email: null,
    role,
    token,
    invitedBy: ctx.userId,
    expiresAt: new Date(Date.now() + 90 * 86_400_000),
  });
  return { token, url: `${APP_URL()}/invite/${token}` };
}

export async function createInvite(
  ctx: Ctx,
  input: { email: string; role: "admin" | "member" },
): Promise<{ id: string; token: string }> {
  assertRole(ctx, "admin");

  const limits = ctxEntitlements(ctx);
  const [members, pendingInvites] = await Promise.all([
    memberCount(ctx),
    ctx.db
      .select({ n: count() })
      .from(invites)
      .where(
        and(
          eq(invites.workspaceId, ctx.workspace.id),
          isNull(invites.acceptedAt),
          gt(invites.expiresAt, new Date()),
        ),
      ),
  ]);
  if (members + (pendingInvites[0]?.n ?? 0) >= limits.maxMembers) {
    throw new LimitError(
      "members",
      `Your plan includes up to ${limits.maxMembers} people`,
    );
  }

  const existing = await ctx.db
    .select({ id: users.id })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(
      and(
        eq(users.email, input.email),
        eq(memberships.workspaceId, ctx.workspace.id),
      ),
    )
    .limit(1);
  if (existing[0]) throw new ValidationError("They're already in this workspace");

  const token = crypto.randomUUID().replace(/-/g, "");
  const [invite] = await ctx.db
    .insert(invites)
    .values({
      workspaceId: ctx.workspace.id,
      email: input.email,
      role: input.role,
      token,
      invitedBy: ctx.userId,
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
    })
    .returning({ id: invites.id, token: invites.token });

  const url = `${APP_URL()}/invite/${token}`;
  await sendEmail({
    to: input.email,
    subject: `Join ${ctx.workspace.name} on Alpha Workspace`,
    html: renderEmail({
      heading: `You're invited to ${escapeHtml(ctx.workspace.name)}`,
      bodyHtml: `<p style="margin:0;">Your team runs their projects on Alpha Workspace, tasks, boards and a Monday briefing that writes itself. Accept the invite to jump in.</p>`,
      cta: { label: "Accept invite", url },
      footnote: "This invite expires in 14 days. If you weren't expecting it, you can ignore this email.",
    }),
    text: `Join ${ctx.workspace.name} on Alpha Workspace: ${url}`,
  });

  return invite;
}

export async function revokeInvite(ctx: Ctx, inviteId: string): Promise<void> {
  assertRole(ctx, "admin");
  await ctx.db
    .delete(invites)
    .where(and(eq(invites.id, inviteId), eq(invites.workspaceId, ctx.workspace.id)));
}

export async function getInvitePublic(db: Db, token: string) {
  const [row] = await db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      expiresAt: invites.expiresAt,
      acceptedAt: invites.acceptedAt,
      workspaceName: workspaces.name,
    })
    .from(invites)
    .innerJoin(workspaces, eq(invites.workspaceId, workspaces.id))
    .where(eq(invites.token, token));
  return row ?? null;
}

export async function acceptInvite(
  db: Db,
  user: { id: string; email: string },
  token: string,
): Promise<{ workspaceSlug: string }> {
  const [invite] = await db
    .select({ invite: invites, workspace: workspaces })
    .from(invites)
    .innerJoin(workspaces, eq(invites.workspaceId, workspaces.id))
    .where(eq(invites.token, token));

  if (!invite || invite.invite.acceptedAt) {
    throw new NotFoundError("This invite is no longer valid");
  }
  if (invite.invite.expiresAt < new Date()) {
    throw new ValidationError("This invite has expired, ask for a fresh one");
  }
  const isLink = invite.invite.email === null;
  if (!isLink && invite.invite.email!.toLowerCase() !== user.email.toLowerCase()) {
    throw new ForbiddenError(
      `This invite was sent to ${invite.invite.email}. Sign in with that address to accept it.`,
    );
  }

  const already = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, invite.invite.workspaceId),
        eq(memberships.userId, user.id),
      ),
    )
    .limit(1);
  if (already[0]) return { workspaceSlug: invite.workspace.slug };

  const [membersNow] = await db
    .select({ n: count() })
    .from(memberships)
    .where(eq(memberships.workspaceId, invite.invite.workspaceId));
  const { entitlementsFor } = await import("@/lib/plans");
  const limits = entitlementsFor(
    invite.workspace.plan,
    invite.workspace.entitlements,
  );
  if ((membersNow?.n ?? 0) >= limits.maxMembers) {
    throw new LimitError(
      "members",
      "This workspace is at its plan's member limit, ask the owner to upgrade",
    );
  }

  await db.insert(memberships).values({
    workspaceId: invite.invite.workspaceId,
    userId: user.id,
    role: invite.invite.role === "admin" ? "admin" : "member",
  });
  // Email invites are single-use; shareable links stay open until revoked.
  if (!isLink) {
    await db
      .update(invites)
      .set({ acceptedAt: new Date() })
      .where(eq(invites.id, invite.invite.id));
  }
  await logActivity(db, {
    workspaceId: invite.invite.workspaceId,
    type: "member_joined",
    actorId: user.id,
    data: { role: invite.invite.role },
  });

  return { workspaceSlug: invite.workspace.slug };
}

/* ------------------------------ usage ------------------------------------ */

export async function workspaceUsage(ctx: Ctx) {
  const { projects, voiceCaptures } = await import("@/server/db/schema");
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [members, activeProjects, capturesThisMonth] = await Promise.all([
    memberCount(ctx),
    ctx.db
      .select({ n: count() })
      .from(projects)
      .where(
        and(eq(projects.workspaceId, ctx.workspace.id), eq(projects.status, "active")),
      ),
    ctx.db
      .select({ n: count() })
      .from(voiceCaptures)
      .where(
        and(
          eq(voiceCaptures.workspaceId, ctx.workspace.id),
          eq(voiceCaptures.source, "voice"),
          gte(voiceCaptures.createdAt, monthStart),
        ),
      ),
  ]);

  const limits = ctxEntitlements(ctx);
  return {
    members,
    activeProjects: activeProjects[0]?.n ?? 0,
    voiceCapturesThisMonth: capturesThisMonth[0]?.n ?? 0,
    limits,
  };
}
