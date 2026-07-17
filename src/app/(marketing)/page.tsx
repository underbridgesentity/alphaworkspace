import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Mic,
  Smartphone,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { PricingCards, PricingFootnote } from "@/components/marketing/pricing-cards";
import { Reveal } from "@/components/marketing/reveal";
import { Blob } from "@/components/marketing/blob";

export const metadata: Metadata = {
  description:
    "Alpha Workspace is the project workspace that does the following up — for South African teams of 2 to 15 people. Status reports itself, tasks cost nothing to create, and it works offline, in rand.",
};

/** Monochrome gradient for display headlines: ink fading toward quiet. */
const headlineGradient = {
  backgroundImage:
    "linear-gradient(180deg, var(--ink) 55%, color-mix(in oklab, var(--ink) 52%, transparent))",
} as const;

export default function LandingPage() {
  return (
    <>
      {/* ------------------------------ hero ------------------------------ */}
      <section className="relative overflow-hidden">
        <Blob
          className="left-[-14%] top-[-6%] h-[26rem] w-[30rem]"
          strength={0.07}
        />
        <Blob
          className="right-[-16%] top-[32%] h-[30rem] w-[34rem]"
          morph={22}
          drift={40}
          strength={0.05}
        />
        <div className="relative mx-auto w-full max-w-5xl px-5 pb-16 pt-16 text-center sm:pt-24 md:px-8">
          <p
            className="animate-fade-up mx-auto w-fit rounded-full border border-dashed border-line-strong px-3.5 py-1 text-xs font-medium text-muted"
            style={{ animationDelay: "0ms" }}
          >
            For South African teams of 2–15 people
          </p>
          <h1
            className="animate-fade-up mx-auto mt-6 max-w-3xl text-balance bg-clip-text text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-transparent sm:text-6xl"
            style={{ animationDelay: "60ms", ...headlineGradient }}
          >
            The workspace that does the following&nbsp;up.
          </h1>
          <p
            className="animate-fade-up mx-auto mt-5 max-w-xl text-pretty text-lg text-muted"
            style={{ animationDelay: "120ms" }}
          >
            Stop chasing status on WhatsApp and email. In Alpha, work captures
            itself, reports itself, and keeps moving even when the connection
            doesn’t — one flat price for the whole team, in rand.
          </p>
          <div
            className="animate-fade-up mx-auto mt-8 flex w-full max-w-xs flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center"
            style={{ animationDelay: "180ms" }}
          >
            <Link
              href="/sign-in"
              className="press rounded-[0.625rem] bg-accent px-6 py-3 text-center font-semibold text-on-accent shadow-[0_10px_36px_-12px_color-mix(in_oklab,var(--ink)_45%,transparent)] hover:bg-accent-hover"
            >
              Start free — no card
            </Link>
            <Link
              href="/pricing"
              className="press rounded-[0.625rem] border border-dashed border-line-strong px-6 py-3 text-center font-medium text-ink transition-colors hover:border-ink/40 hover:bg-raised"
            >
              See pricing
            </Link>
          </div>

          {/* The product moment: Monday writes itself. */}
          <div
            className="animate-fade-up mx-auto mt-14 max-w-xl text-left"
            style={{ animationDelay: "260ms" }}
          >
            <div className="grad-card card-lift rounded-card border border-dashed border-line-strong bg-surface/80 p-5 shadow-[var(--shadow-overlay)]">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-ink" />
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                  Monday 06:30 · Weekly briefing
                </p>
              </div>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink/95">
                The team closed out 14 tasks this week against 11 new ones.
                Thabo carried 40% of completions — rebalance before it snaps.
                Liberty has had nothing move in 6 days; quiet client projects
                are how surprises happen. Watch Friday: the Vodacom July batch
                and the Karoo Coffee review land on the same day.
              </p>
              <p className="mt-3 text-xs text-faint">
                Written by Alpha from your team’s actual activity. Nobody
                compiled it.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="hairline-fade mx-auto max-w-4xl" />

      {/* --------------------------- pillar: reports ---------------------- */}
      <section className="relative overflow-hidden">
        <Blob
          className="left-[-12%] bottom-[-30%] h-[24rem] w-[26rem]"
          morph={20}
          drift={44}
          strength={0.05}
        />
        <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                It reports itself
              </p>
              <h2
                className="mt-2 text-balance bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl"
                style={headlineGradient}
              >
                Nobody compiles a status report. Ever again.
              </h2>
              <p className="mt-3 text-muted">
                Zero-setup KPIs read straight from the work: what got done, what
                slipped, who’s overloaded, which client project has gone quiet.
                Every Monday a short, human briefing lands in-app, by email and
                by push — written like a sharp ops lead, not a data dump. Each
                morning, everyone gets their three things.
              </p>
            </Reveal>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Completion rate", value: "62%", note: "this week" },
                { label: "Overdue", value: "3", note: "need a decision", tone: "text-danger" },
                { label: "Cycle time", value: "2.4d", note: "created → done" },
              ].map((t, i) => (
                <Reveal key={t.label} delay={120 + i * 90}>
                  <div className="grad-card card-lift h-full rounded-card border border-dashed border-line bg-surface p-4">
                    <p className="text-[11px] font-medium text-faint">{t.label}</p>
                    <p
                      className={`mt-1 text-2xl font-semibold tracking-tight tabular ${t.tone ?? ""}`}
                    >
                      {t.value}
                    </p>
                    <p className="mt-0.5 text-[11px] text-faint">{t.note}</p>
                  </div>
                </Reveal>
              ))}
              <Reveal delay={390} className="col-span-3">
                <div className="grad-card card-lift rounded-card border border-dashed border-line bg-surface p-4">
                  <p className="text-xs text-muted">
                    <span className="font-semibold text-ink">Morning brief:</span>{" "}
                    Morning Naledi — two overdue need a decision, then Friday’s
                    deadline. Everything else can wait.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------- pillar: capture ---------------------- */}
      <section className="section-invert relative overflow-hidden border-y border-dashed border-line bg-bg text-ink">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--ink) 4%, transparent), transparent 45%, color-mix(in oklab, var(--ink) 3%, transparent))",
          }}
        />
        <Blob
          className="right-[-10%] top-[-24%] h-[22rem] w-[26rem]"
          morph={24}
          drift={38}
          strength={0.06}
        />
        <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <Reveal delay={120} className="order-2 md:order-1">
              <div className="grad-card card-lift rounded-card border border-dashed border-line-strong bg-surface p-5 shadow-[var(--shadow-overlay)]">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                    <Mic className="size-4" />
                  </span>
                  <p className="text-sm italic text-muted">
                    “Naledi to send the Vodacom report by Friday, then homepage
                    concepts for Liberty next week Tuesday…”
                  </p>
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    {
                      title: "Send the Vodacom report",
                      chips: ["Vodacom retainer", "Naledi", "Friday"],
                    },
                    {
                      title: "Homepage concepts",
                      chips: ["Liberty rebrand", "unassigned", "Tue 21 Jul"],
                    },
                  ].map((t) => (
                    <div
                      key={t.title}
                      className="rounded-control border border-dashed border-line bg-raised/70 p-3 transition-colors hover:border-line-strong"
                    >
                      <p className="text-sm font-medium">{t.title}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {t.chips.map((c) => (
                          <span
                            key={c}
                            className="rounded-full bg-overlay px-2 py-0.5 text-[11px] text-muted"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <span className="press inline-flex items-center gap-1.5 rounded-control bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent">
                    <Check className="size-4" /> Create 2 tasks
                  </span>
                </div>
              </div>
            </Reveal>
            <Reveal className="order-1 md:order-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                Capturing work costs nothing
              </p>
              <h2
                className="mt-2 text-balance bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl"
                style={headlineGradient}
              >
                Hold the mic. Talk for ninety seconds. Confirm.
              </h2>
              <p className="mt-3 text-muted">
                Walk out of a client call and speak everything that needs
                doing — people, projects, days. Alpha extracts the tasks and
                shows you the list before anything is created. Or type{" "}
                <span className="rounded border border-dashed border-line bg-raised px-1.5 py-0.5 text-sm text-ink">
                  homepage concepts for Liberty, Thabo, Friday
                </span>{" "}
                and press enter. The AI proposes; you always confirm.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* --------------------------- pillar: built for here ---------------- */}
      <section className="relative overflow-hidden">
        <Blob
          className="left-[38%] bottom-[-36%] h-[24rem] w-[30rem]"
          morph={19}
          drift={46}
          strength={0.05}
        />
        <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                Built for here
              </p>
              <h2
                className="mt-2 text-balance bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl"
                style={headlineGradient}
              >
                Offline-first. Light on data. Priced in rand.
              </h2>
              <p className="mt-3 text-muted">
                Alpha installs like an app and keeps working when the connection
                doesn’t — reads come from cache, changes queue and sync the
                moment you’re back. It’s deliberately light on data. And where
                dollar-priced tools cost a 10-person team R2,000+ a month,
                Alpha’s whole-team band is a quarter of that, billed locally
                through PayFast.
              </p>
            </Reveal>
            <div className="flex flex-col gap-2">
              {[
                { icon: WifiOff, label: "Offline-first — work continues without signal" },
                { icon: Smartphone, label: "Installable app, light on data" },
                { icon: Check, label: "R499/month — the whole team, VAT incl." },
              ].map((b, i) => (
                <Reveal key={b.label} delay={120 + i * 90}>
                  <div className="grad-card card-lift flex items-center gap-2.5 rounded-card border border-dashed border-line bg-surface px-4 py-3.5">
                    <b.icon className="size-4 shrink-0 text-ink" />
                    <span className="text-sm text-muted">{b.label}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ manifesto -------------------------- */}
      <section className="section-invert border-y border-dashed border-line bg-bg text-ink">
        <Reveal>
          <div className="mx-auto w-full max-w-3xl px-5 py-14 text-center md:px-8">
            <p
              className="text-balance bg-clip-text text-lg font-medium tracking-tight text-transparent sm:text-2xl"
              style={headlineGradient}
            >
              “Every feature must reduce follow-up messages between humans — or
              it doesn’t ship.”
            </p>
            <p className="mt-3 text-sm text-faint">
              The anti-noise law. It’s why Alpha exists.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------ pricing ---------------------------- */}
      <section className="relative overflow-hidden">
        <Blob
          className="right-[-14%] top-[6%] h-[26rem] w-[28rem]"
          morph={21}
          drift={42}
          strength={0.05}
        />
        <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <h2
              className="bg-clip-text text-center text-2xl font-semibold tracking-tight text-transparent sm:text-3xl"
              style={headlineGradient}
            >
              Flat bands. No per-seat maths.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-center text-muted">
              Your finance lead will read this once and nod.
            </p>
          </Reveal>
          <div className="mt-8">
            <PricingCards />
            <Reveal delay={300}>
              <PricingFootnote />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------ final CTA -------------------------- */}
      <section className="mx-auto w-full max-w-5xl px-5 pb-20 md:px-8">
        <Reveal>
          <div className="section-invert grad-card relative overflow-hidden rounded-card border border-dashed border-line-strong bg-bg px-6 py-14 text-center text-ink">
            <Blob
              className="left-[-8%] top-[-40%] h-[16rem] w-[20rem]"
              morph={16}
              drift={30}
              strength={0.07}
            />
            <div className="relative">
              <h2
                className="text-balance bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl"
                style={headlineGradient}
              >
                Your Monday briefing could write itself next week.
              </h2>
              <p className="mx-auto mt-2 max-w-md text-muted">
                Set up in under two minutes. Free for teams of three — no card,
                no trial clock.
              </p>
              <Link
                href="/sign-in"
                className="press mt-6 inline-flex items-center gap-2 rounded-[0.625rem] bg-accent px-6 py-3 font-semibold text-on-accent shadow-[0_10px_36px_-12px_color-mix(in_oklab,var(--ink)_45%,transparent)] hover:bg-accent-hover"
              >
                Start free
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
