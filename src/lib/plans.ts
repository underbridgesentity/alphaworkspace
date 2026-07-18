/**
 * Pricing bands and entitlements, the single config object.
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
  | "client_reports"
  // Add-on, NOT part of any band: enabled per workspace via the operator
  // portal (it carries real per-minute vendor cost). Lives in the snapshot.
  | "meeting_bots";

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
  /** Recorded-meeting transcription minutes per workspace per month. */
  meetingMinutesPerMonth: number;
  /** Total attachment storage per workspace. */
  attachmentQuotaMb: number;
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
    meetingMinutesPerMonth: 60,
    attachmentQuotaMb: 200,
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
    meetingMinutesPerMonth: 600,
    attachmentQuotaMb: 2_048,
    // Joseph's rule (2026-07-17): paid bands share EVERY feature; the bands
    // differ only in quantities (people, captures, storage). Features listed
    // per plan so planWithFeature() keeps deriving honest upgrade copy.
    features: [
      "weekly_narrative",
      "morning_brief",
      "scorecards",
      "time_tracking",
      "client_reports",
    ],
  },
  studio: {
    id: "studio",
    name: "Studio",
    tagline: "For teams running serious volume.",
    priceMonthlyZar: 999,
    priceAnnualZar: 9990,
    maxMembers: 25,
    maxActiveProjects: null,
    voiceCapturesPerMonth: 1000,
    meetingMinutesPerMonth: 1500,
    attachmentQuotaMb: 10_240,
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
  meetingMinutesPerMonth: number;
  attachmentQuotaMb: number;
  features: Feature[];
}

/** Loosely-typed stored snapshot (jsonb), features arrive as plain strings. */
export interface EntitlementsSnapshotInput {
  maxMembers?: number;
  maxActiveProjects?: number | null;
  voiceCapturesPerMonth?: number;
  meetingMinutesPerMonth?: number;
  attachmentQuotaMb?: number;
  features?: string[];
}

/** Effective entitlements: a stored snapshot wins, else the plan config. */
export function entitlementsFor(
  plan: PlanId,
  snapshot?: EntitlementsSnapshotInput | null,
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
    meetingMinutesPerMonth:
      snapshot?.meetingMinutesPerMonth ?? base.meetingMinutesPerMonth,
    attachmentQuotaMb: snapshot?.attachmentQuotaMb ?? base.attachmentQuotaMb,
    features: (snapshot?.features as Feature[] | undefined) ?? base.features,
  };
}

export function can(
  plan: PlanId,
  feature: Feature,
  snapshot?: EntitlementsSnapshotInput | null,
): boolean {
  return entitlementsFor(plan, snapshot).features.includes(feature);
}

/** The cheapest plan that includes a feature (drives upgrade copy). */
export function planWithFeature(feature: Feature): PlanConfig {
  for (const plan of [PLANS.free, PLANS.team, PLANS.studio]) {
    if (plan.features.includes(feature)) return plan;
  }
  return PLANS.studio;
}

export function formatZar(amount: number): string {
  return `R${amount.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
