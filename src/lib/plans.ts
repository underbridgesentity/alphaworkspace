/**
 * Pricing bands and entitlements — the single config object.
 * Changing a plan is a config change here, never a code change elsewhere.
 * Client-safe (the pricing page renders from this).
 *
 * Prices are ZAR, VAT inclusive. Flat team bands, never per-seat.
 */

export type PlanId = "free" | "team" | "studio";

export type Feature =
  | "weekly_narrative"
  | "morning_brief"
  // Phase 2 features gate on these flags when they ship:
  | "scorecards"
  | "time_tracking"
  | "client_reports";

export interface PlanConfig {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthlyZar: number;
  /** Two months free. */
  priceAnnualZar: number;
  maxMembers: number;
  /** null = unlimited. */
  maxActiveProjects: number | null;
  voiceCapturesPerMonth: number;
  features: Feature[];
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Taste the magic. Yours forever.",
    priceMonthlyZar: 0,
    priceAnnualZar: 0,
    maxMembers: 3,
    maxActiveProjects: 2,
    voiceCapturesPerMonth: 20,
    features: ["weekly_narrative"],
  },
  team: {
    id: "team",
    name: "Team",
    tagline: "The whole team, for less than lunch.",
    priceMonthlyZar: 499,
    priceAnnualZar: 4990,
    maxMembers: 10,
    maxActiveProjects: null,
    voiceCapturesPerMonth: 200,
    features: ["weekly_narrative", "morning_brief"],
  },
  studio: {
    id: "studio",
    name: "Studio",
    tagline: "For studios running serious volume.",
    priceMonthlyZar: 999,
    priceAnnualZar: 9990,
    maxMembers: 25,
    maxActiveProjects: null,
    voiceCapturesPerMonth: 1000,
    features: [
      "weekly_narrative",
      "morning_brief",
      "scorecards",
      "time_tracking",
      "client_reports",
    ],
  },
};

export interface Entitlements {
  maxMembers: number;
  maxActiveProjects: number | null;
  voiceCapturesPerMonth: number;
  features: Feature[];
}

/** Effective entitlements: a stored snapshot wins, else the plan config. */
export function entitlementsFor(
  plan: PlanId,
  snapshot?: Partial<Entitlements> | null,
): Entitlements {
  const base = PLANS[plan];
  return {
    maxMembers: snapshot?.maxMembers ?? base.maxMembers,
    maxActiveProjects:
      snapshot?.maxActiveProjects !== undefined
        ? snapshot.maxActiveProjects
        : base.maxActiveProjects,
    voiceCapturesPerMonth:
      snapshot?.voiceCapturesPerMonth ?? base.voiceCapturesPerMonth,
    features: (snapshot?.features as Feature[] | undefined) ?? base.features,
  };
}

export function can(
  plan: PlanId,
  feature: Feature,
  snapshot?: Partial<Entitlements> | null,
): boolean {
  return entitlementsFor(plan, snapshot).features.includes(feature);
}

export function formatZar(amount: number): string {
  return `R${amount.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
