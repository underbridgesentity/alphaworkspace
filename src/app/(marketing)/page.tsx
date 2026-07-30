import type { Metadata } from "next";
import { PricingCards, PricingFootnote } from "@/components/marketing/pricing-cards";
import { Reveal } from "@/components/marketing/reveal";
import { Blob } from "@/components/marketing/blob";
import { Hero } from "@/components/marketing/sections/hero";
import { Proof } from "@/components/marketing/sections/proof";
import { FollowingUp } from "@/components/marketing/sections/following-up";
import { Capture } from "@/components/marketing/sections/capture";
import { Briefing } from "@/components/marketing/sections/briefing";
import { BuiltForHere } from "@/components/marketing/sections/built-for-here";
// The founder note speaks in Joseph's first person and signs his name, so it
// stays out of production until he has read and approved the copy. Re-enable
// by restoring this import and the element below.
// import { FounderNote } from "@/components/marketing/sections/founder-note";
import { Closing } from "@/components/marketing/sections/closing";

export const metadata: Metadata = {
  description:
    "Alpha Workspace is the project workspace that does the following up, for South African teams of 2 to 25 people. Status reports itself, tasks cost nothing to create, and it works offline, in rand.",
};

/**
 * The landing page, v2. The hero (editorial type, kept) states an identity;
 * everything after it now has one job each, and the first job is PROOF: the
 * old page followed a type hero with more type, and a page that never shows
 * the product reads as a product that does not exist. Real screenshots of
 * the seeded demo workspace now carry three sections, all in one hairline
 * frame treatment (.mkt-frame / .mkt-phone, globals.css).
 *
 * Colour rhythm is bands, not rainbows: frost, teal wash (Proof), frost
 * (FollowingUp, Briefing), warm paper (Capture, FounderNote), one deep ink
 * band (BuiltForHere), frost (pricing), ink card (Closing). Teal stays the
 * accent thread; gold and indigo only ever mark the thing they mean.
 *
 * Order is an argument: see the product (Proof), see the promise kept
 * (FollowingUp), how work gets in (Capture), how status gets out (Briefing,
 * real shots), why it fits here (BuiltForHere), why to believe us with no
 * logo wall (FounderNote), what it costs, the ask.
 *
 * Cut rather than kept: the Numbers section (scorecards demo). It was the
 * only band selling a feature instead of the promise, the pricing cards
 * already name scorecards and time tracking, and cutting it keeps the page
 * nearer Notion's length than ClickUp's. Also cut: the closing proof strip
 * (now lives once, in BuiltForHere) and the hero's hairline divider, since
 * the Proof band's own edge is the punctuation now.
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Proof />
      <FollowingUp />
      <Capture />
      <Briefing />
      <BuiltForHere />
      {/* <FounderNote /> pending the founder's sign-off on his own letter */}

      {/* ------------------------------ pricing ---------------------------- */}
      <section className="relative overflow-hidden">
        <Blob
          className="right-[-14%] top-[6%] h-[26rem] w-[28rem]"
          morph={21}
          drift={42}
          strength={0.05}
        />
        <div aria-hidden className="streak right-[-6%] bottom-[18%]" style={{ animationDelay: "6s" }} />
        <div className="relative mx-auto w-full max-w-5xl px-5 py-chapter md:px-8 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Reveal>
              <p className="section-head">What it costs</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="mt-group text-balance text-display-sm sm:text-display">
                Flat bands. No per-seat maths.
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-item text-lede text-muted">
                Hiring your fifth person does not change what you pay.
              </p>
            </Reveal>
          </div>
          <div className="mt-section">
            <PricingCards />
          </div>
          <PricingFootnote />
        </div>
      </section>

      <Closing />
    </>
  );
}
