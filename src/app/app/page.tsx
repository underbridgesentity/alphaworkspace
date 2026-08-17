import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { listWorkspacesForUser } from "@/server/dal/workspaces";
import { normalizeSharedText, SHARE_PARAM } from "@/lib/shell";

/**
 * Post-sign-in router: first workspace, or onboarding when there is none.
 * A `plan` hint (set when someone picked a paid band on the pricing page)
 * is carried through to billing so "Start with Team" actually lands them on
 * Team checkout, even for brand-new users who create a workspace first.
 *
 * It is also the landing point for the OS share sheet, which can only hand us
 * a link. `?share=` is carried to the workspace, where the app shell opens
 * quick-add with it and immediately strips it from the URL. The Android share
 * target does NOT come through here (it uses a window event, so the text never
 * touches a URL at all); this is the cold path and the iOS fallback.
 */
export default async function AppEntry({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; share?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const plan =
    params.plan === "team" || params.plan === "studio" ? params.plan : null;
  // Re-normalised rather than passed through: the value arrives from another
  // app's share sheet and is about to be put back into a URL.
  const share = normalizeSharedText(params.share);

  const workspaces = await listWorkspacesForUser(db, user.id);

  const query = new URLSearchParams();
  if (plan) query.set("plan", plan);
  if (share) query.set(SHARE_PARAM, share);
  const qs = query.toString();
  const suffix = qs ? `?${qs}` : "";

  if (workspaces.length === 0) {
    // Onboarding has no quick-add to prefill, so only the plan hint survives.
    redirect(`/onboarding${plan ? `?plan=${plan}` : ""}`);
  }
  redirect(
    plan
      ? `/w/${workspaces[0].slug}/settings/billing${suffix}`
      : `/w/${workspaces[0].slug}${suffix}`,
  );
}
