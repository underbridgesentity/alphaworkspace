"use client";

/**
 * The friendly band-limit moment. Never a dead end: existing work is safe,
 * the path up is one tap, and closing it costs nothing.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { PLANS, formatZar, planWithFeature, type Feature } from "@/lib/plans";
import { useWorkspace } from "@/lib/client/workspace";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LimitDetail {
  limit?: "members" | "projects" | "captures" | "feature";
  feature?: string;
  message: string;
}

const HEADLINES: Record<string, string> = {
  members: "Room for the whole team",
  projects: "More projects, same calm",
  captures: "Keep talking, we'll keep writing",
  feature: "That one's a Studio thing",
};

export function UpgradePrompt() {
  const { workspace } = useWorkspace();
  const [detail, setDetail] = useState<LimitDetail | null>(null);

  useEffect(() => {
    const onLimit = (e: Event) => setDetail((e as CustomEvent<LimitDetail>).detail);
    window.addEventListener("aw:limit", onLimit);
    return () => window.removeEventListener("aw:limit", onLimit);
  }, []);

  if (!detail) return null;

  // For a feature gate, pitch the CHEAPEST plan that has it; for capacity
  // limits, pitch the band above the current one.
  const nextPlan =
    detail.limit === "feature"
      ? planWithFeature((detail.feature ?? "client_reports") as Feature)
      : workspace.plan === "free"
        ? PLANS.team
        : PLANS.studio;

  return (
    <Dialog
      open
      onClose={() => setDetail(null)}
      ariaLabel="Upgrade your plan"
      variant="center"
    >
      <DialogHeader
        title={HEADLINES[detail.limit ?? ""] ?? "Time for more headroom"}
        onClose={() => setDetail(null)}
      />
      <div className="px-5 pb-5">
        <p className="text-muted">{detail.message}.</p>
        <div className="mt-4 rounded-card bg-raised p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" />
            <p className="font-semibold">
              {nextPlan.name}, {formatZar(nextPlan.priceMonthlyZar)}/month
            </p>
          </div>
          <p className="mt-1 text-sm text-muted">
            Up to {nextPlan.maxMembers} people ·{" "}
            {nextPlan.maxActiveProjects === null
              ? "unlimited projects"
              : `${nextPlan.maxActiveProjects} projects`}{" "}
            · {nextPlan.voiceCapturesPerMonth} voice captures/month. VAT
            inclusive, billed in rand. Nothing you’ve made is ever locked away.
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDetail(null)}>
            Not now
          </Button>
          <Link href={`/w/${workspace.slug}/settings/billing`}>
            <Button onClick={() => setDetail(null)}>See plans</Button>
          </Link>
        </div>
      </div>
    </Dialog>
  );
}
