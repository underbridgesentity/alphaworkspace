import Link from "next/link";
import Image from "next/image";
import { InView } from "@/components/marketing/in-view";

/* ---------------------------------------------------------------------------
 * THE HERO: THE SENTENCE, THEN THE PROOF
 *
 * Two zones, deliberately placed. The upper zone is kept clear for the type:
 * centred, hand-broken lines, the teal full stop as the only ornament. The
 * lower zone is the product itself, the real board from the demo workspace,
 * framed and anchored to the fold so the page opens on the claim and lands on
 * the evidence. The colour washes arc around the image's top edge, so the
 * ground gets warmer exactly where the eye arrives.
 *
 * What is deliberately NOT here, all removed on the owner's direct feedback:
 * no ruled-paper lines, no vertical change bar in the margin, no masthead or
 * colophon rules, and no location callout (the product's origin shows in the
 * substance and once in the footer; it does not need a banner).
 *
 * THE LINE BREAKS ARE STILL DESIGNED, NOT DISCOVERED: two lines on a wide
 * screen so "does the following up." stays whole, three on a phone. The image
 * crops rather than shrinks on a phone: object-left-top shows the first
 * columns of the real board at legible scale instead of a postage stamp of
 * the whole thing.
 *
 * Motion: copy rises in reading order, then the board rises last, one pass,
 * transform and opacity only. Reduced motion collapses to visible and still.
 * The board image is the fold's LCP so it loads with priority, never lazy.
 * ------------------------------------------------------------------------- */

const CSS = `
.hero-head {
  font-size: clamp(2.25rem, 11vw, 3.5rem);
  line-height: 0.98;
  letter-spacing: -0.032em;
}
@media (min-width: 40rem) {
  .hero-head {
    font-size: clamp(3rem, 7.2vw, 5rem);
    line-height: 0.95;
    letter-spacing: -0.042em;
  }
}
/* The ground: the product's semantic trio at whisper alpha, positioned for a
   CENTRED composition, teal high behind the headline, gold and indigo low on
   either flank of the board so the image sits in warmth rather than floating
   on flat cream. Static paint, no JS, no filters; the grain exists because
   low-alpha gradients on cream band visibly on cheap panels and noise breaks
   the banding. */
.hero-ground {
  background:
    radial-gradient(56rem 30rem at 50% 6%, rgba(23, 104, 92, 0.06), transparent 62%),
    radial-gradient(44rem 30rem at 12% 88%, rgba(169, 126, 34, 0.07), transparent 62%),
    radial-gradient(44rem 30rem at 88% 86%, rgba(77, 95, 168, 0.05), transparent 62%);
}
.hero-grain {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  opacity: 0.05;
  mix-blend-mode: multiply;
}
`;

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <style href="hero" precedence="medium">
        {CSS}
      </style>

      {/* Painted ground. aria-hidden and pointer-events-none: never content,
          never intercepts a tap. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="hero-ground absolute inset-0" />
        <div className="hero-grain absolute inset-0" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-5 pt-16 md:px-8 md:pt-24">
        <InView>
          {/* ------------------------ the clear zone ---------------------- */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="anim anim-rise section-head">
              For teams of 2 to 15 people
            </p>

            <h1
              className="hero-head anim anim-rise mx-auto mt-6 font-semibold text-ink-strong"
              style={{ animationDelay: "60ms" }}
            >
              The workspace{" "}
              <br aria-hidden className="sm:hidden" />
              that{" "}
              <br aria-hidden className="hidden sm:inline" />
              does the{" "}
              <br aria-hidden className="sm:hidden" />
              following up
              <span className="text-accent-quiet">.</span>
            </h1>

            <p
              className="anim anim-rise mx-auto mt-6 max-w-[36rem] text-lede text-muted sm:text-[1.1875rem]"
              style={{ animationDelay: "160ms" }}
            >
              Work captures itself, status reports itself,{" "}
              <br aria-hidden className="hidden sm:inline" />
              and nobody has to ask twice.
            </p>

            <div
              className="anim anim-rise mt-8 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-7"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                href="/sign-in"
                className="press rounded-control bg-accent px-7 py-3.5 text-center font-semibold text-on-accent hover:bg-accent-hover"
              >
                Start free, no card
              </Link>
              {/* Secondary is a rule under a word, not a second button. Two
                  buttons side by side means neither one is the answer. */}
              <Link
                href="/pricing"
                className="press group inline-flex min-h-11 items-center justify-center font-medium text-ink"
              >
                <span className="border-b border-line-strong pb-1 transition-colors group-hover:border-accent-line group-hover:text-accent-quiet">
                  See pricing
                </span>
              </Link>
            </div>
          </div>

          {/* ------------------------- the evidence ------------------------ */}
          {/* The real board from the demo workspace, in the page's single
              frame treatment, anchored to the fold. On a phone the same
              artifact is CROPPED, not shrunk: object-left-top keeps the first
              column readable instead of rendering the whole board as texture. */}
          <div
            className="anim anim-rise mt-12 sm:mt-16"
            style={{ animationDelay: "320ms" }}
          >
            <div className="mkt-frame relative mx-auto aspect-[9/10] w-full max-w-[26rem] sm:aspect-[16/8.4] sm:max-w-none">
              <Image
                src="/marketing/shots/board-desktop-light.png"
                alt="A project board in Alpha Workspace: To do, In progress and Done columns with real tasks, coloured due-date rails on the leading edge of each card"
                fill
                priority
                sizes="(min-width: 64rem) 72rem, 94vw"
                className="object-cover object-left-top"
              />
            </div>
          </div>
        </InView>
      </div>
    </section>
  );
}
