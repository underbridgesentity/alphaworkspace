/**
 * "Built for here": the differentiation a global competitor cannot claim,
 * on the page's one deep ink band (.section-invert).
 *
 * Left: six checkable local-reality facts, each a small inline icon plus two
 * lines, teal accents reading strongest against the dark ground. Right: the
 * real mobile screenshot in a phone frame (.mkt-phone) rising out of the
 * band's bottom edge, so the band itself does the cropping. This is the
 * dark-ground treatment for imagery: the phone ring is the frame, no card.
 *
 * At 375px: the fact grid drops to one column, and the phone moves below
 * the copy, centered, still cropped by the band edge so it reads as
 * emerging rather than pasted. The phone image is 390px wide at 2x, tiny
 * bytes, and lazy like everything below the fold.
 */
import {
  Banknote,
  FileDown,
  MonitorSmartphone,
  Signal,
  Sunrise,
  WifiOff,
} from "lucide-react";
import Image from "next/image";
import { InView } from "@/components/marketing/in-view";
import { Reveal } from "@/components/marketing/reveal";

const FACTS: Array<{ icon: typeof WifiOff; label: string; body: string }> = [
  {
    icon: WifiOff,
    label: "Offline is normal",
    body: "When the connection drops, reads come from cache and writes queue on the phone, then land when signal returns.",
  },
  {
    icon: Signal,
    label: "Light on data",
    body: "Built to stay quick on a mid-range Android over 3G. No megabyte tax for opening your own task list.",
  },
  {
    icon: Banknote,
    label: "Priced in rand",
    body: "R0, R499 or R999 a month, VAT inclusive, billed through PayFast. No forex surprise on the statement.",
  },
  {
    icon: Sunrise,
    label: "On SAST time",
    body: "Morning briefs at 06:30, weekly narrative on Monday morning, because mornings happen here.",
  },
  {
    icon: MonitorSmartphone,
    label: "Installs from the browser",
    body: "A proper app on the home screen without an app store, updates included. Android first, everything else too.",
  },
  {
    icon: FileDown,
    label: "Your data, POPIA",
    body: "Export everything you have put in, or delete your account outright, from settings. No support ticket.",
  },
];

export function BuiltForHere() {
  return (
    <section className="section-invert relative overflow-hidden bg-bg text-ink">
      <div aria-hidden className="streak right-[-10%] top-[8%]" />
      <div className="relative mx-auto w-full max-w-5xl px-5 pt-chapter md:px-8 md:pt-24">
        <div className="grid gap-group md:grid-cols-[1.15fr_0.85fr] md:gap-14">
          {/* ------------------------- copy + facts ------------------------- */}
          <div className="pb-chapter md:pb-24">
            <Reveal>
              <p className="section-head">Built for real conditions</p>
              {/* Hand-set break so the parallel triple stays balanced. */}
              <h2 className="mt-group text-display-sm sm:text-display">
                Real phones, real networks,{" "}
                <br aria-hidden />
                real budgets.
              </h2>
              <p className="mt-item max-w-prose text-pretty text-lede text-muted">
                The tools this replaces assume fibre, an iPhone and a dollar
                card. This one assumes a mid-range Android, a connection that
                comes and goes, and a data bundle that has to last the month.
              </p>
            </Reveal>

            <div className="mt-section grid gap-group sm:grid-cols-2 sm:gap-x-8">
              {FACTS.map((fact, i) => {
                const Icon = fact.icon;
                return (
                  <Reveal key={fact.label} delay={(i % 2) * 90}>
                    <div className="flex items-center gap-tight">
                      <Icon aria-hidden className="size-4 text-accent" />
                      <h3 className="section-head">{fact.label}</h3>
                    </div>
                    <p className="mt-tight text-dense text-muted">
                      {fact.body}
                    </p>
                  </Reveal>
                );
              })}
            </div>
          </div>

          {/* ----------------- the phone, out of the dark ------------------- */}
          {/* self-end + no bottom padding on this column: the phone's bottom
              is clipped by the section edge (overflow-hidden), the Linear
              "emerging from the ground" move. */}
          <InView className="relative mx-auto -mb-10 mt-2 w-56 self-end sm:w-64 md:-mb-14 md:mt-0">
            <div className="anim anim-rise">
              <div className="mkt-phone">
                <Image
                  src="/marketing/shots/my-work-mobile-light.png"
                  alt="Alpha Workspace running as an installed app on a phone: morning brief, today's tasks and the bottom tab bar"
                  width={390}
                  height={844}
                  sizes="16rem"
                  className="h-auto w-full"
                />
              </div>
            </div>
            {/* One floating chip: the offline promise, on the device that
                keeps it. */}
            <div
              aria-hidden
              className="anim anim-pop absolute -left-4 top-16 sm:-left-10"
              style={{ animationDelay: "600ms" }}
            >
              <div className="anim-bob flex items-center gap-tight whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-micro shadow-e2">
                <WifiOff className="size-3 text-muted" />
                Offline · 3 writes queued
              </div>
            </div>
          </InView>
        </div>
      </div>
    </section>
  );
}
