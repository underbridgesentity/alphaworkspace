import type { Metadata } from "next";
import { PricingCards, PricingFootnote } from "@/components/marketing/pricing-cards";
import { Reveal } from "@/components/marketing/reveal";
import { Blob } from "@/components/marketing/blob";
import { Hero } from "@/components/marketing/sections/hero";
import { BoardShow } from "@/components/marketing/sections/board-show";
import { Capture } from "@/components/marketing/sections/capture";
import { Report } from "@/components/marketing/sections/report";
import { NudgeOffline } from "@/components/marketing/sections/nudge-offline";
import { Numbers } from "@/components/marketing/sections/numbers";
import { Closing } from "@/components/marketing/sections/closing";

export const metadata: Metadata = {
  description:
    "Alpha Workspace is the project workspace that does the following up, for South African teams of 2 to 15 people. Status reports itself, tasks cost nothing to create, and it works offline, in rand.",
};

/**
 * The landing page is a sequence of self-contained animated sections
 * (components/marketing/sections/*), each choreographed with the shared
 * .anim vocabulary and gated by <InView>. Order tells the product story:
 * see it move, capture, report, stay calm, count what matters, decide.
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <div className="hairline-fade mx-auto max-w-4xl" />
      <BoardShow />
      <Capture />
      <Report />
      <div className="hairline-fade mx-auto max-w-4xl" />
      <NudgeOffline />
      <Numbers />

      {/* ------------------------------ pricing ---------------------------- */}
      <section className="relative overflow-hidden">
        <Blob
          className="right-[-14%] top-[6%] h-[26rem] w-[28rem]"
          morph={21}
          drift={42}
          strength={0.05}
        />
        <div aria-hidden className="streak right-[-6%] bottom-[18%]" style={{ animationDelay: "6s" }} />
        <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Flat bands. No per-seat maths.
            </h2>
            <p className="mt-2 text-center text-muted">
              Your finance lead will read this once and nod.
            </p>
          </Reveal>
          <div className="mt-10">
            <PricingCards />
          </div>
          <PricingFootnote />
        </div>
      </section>

      <Closing />
    </>
  );
}
