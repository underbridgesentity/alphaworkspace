import Link from "next/link";
import { InView } from "@/components/marketing/in-view";

/* ---------------------------------------------------------------------------
 * HERO, CONCEPT A: "EDITORIAL"
 *
 * The stance: there is no product illustration, because the sentence is the
 * product. A collage of tilted cards is a picture of software; a title page is
 * a picture of a point of view. So this is set like the opening spread of a
 * magazine: a masthead rule with a running head under it, one enormous type
 * block, one deck, two actions, a colophon rule to close the page.
 *
 * Three decisions carry the whole thing.
 *
 * 1. THE LINE BREAKS ARE DESIGNED, NOT DISCOVERED. The browser never chooses
 *    where this sentence turns. A wide screen gets two lines, so the promise
 *    stays whole on the second one ("does the following up."); a phone gets
 *    three at a narrower measure. Two rags, both hand set, neither one an
 *    accident of the viewport. The deck below is broken by hand for the same
 *    reason.
 *
 * 2. THE FULL STOP IS TEAL. One glyph. It is the only ornament in the type,
 *    it costs nothing, and it is the argument in miniature: this product ends
 *    the conversation. You do not notice it, then you do.
 *
 * 3. THE HANGING RULE IS A CHANGE BAR. In print, a vertical rule in the margin
 *    marks the line that changed, the line you are meant to read. Here it runs
 *    the height of the headline in hairline grey and turns accent for exactly
 *    the last line, the one that carries the promise. It is also, not by
 *    coincidence, the follow-up rail from the app: the same 2px mark that sits
 *    on the leading edge of every piece of work inside the product.
 *
 * At 375px: the visual survives whole rather than simplifying, because it IS
 * the type. The headline re-breaks to three hand-set lines, the hanging rule
 * moves from a 2rem margin to 1rem, and its accent segment moves from the
 * bottom half to the bottom third so it still lands on the payoff line. Nothing
 * is hidden on a phone because nothing decorative exists to hide.
 *
 * Motion: two things move, both once, both transform and opacity only. Copy
 * rises in reading order, and the change bar draws downward, which is the
 * follow-up arriving. No idle loops, no bobbing, nothing repeating in the
 * corner of the eye. Reduced motion collapses all of it to visible and still.
 * ------------------------------------------------------------------------- */

/* Type spec lives here rather than in arbitrary Tailwind values: this hero is
 * a typographic object, and size, leading and tracking should be legible as one
 * paragraph of intent. Both tracking and leading close up as the size grows,
 * which is the optical rule the token scale already follows. */
const CSS = `
.hcA-head {
  font-size: clamp(2.25rem, 11vw, 3.5rem);
  line-height: 0.98;
  letter-spacing: -0.032em;
}
@media (min-width: 40rem) {
  .hcA-head {
    font-size: clamp(3rem, 8.4vw, 5.5rem);
    line-height: 0.95;
    letter-spacing: -0.042em;
  }
}
/* The change bar draws top to bottom. Pairs with .anim, which supplies the
   duration, the easing and the pause-until-in-view; only the name and the
   origin are set here, so nothing fights the shared choreography. */
@keyframes hcA-draw {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}
.hcA-rule {
  animation-name: hcA-draw;
  transform-origin: top center;
}
@media (prefers-reduced-motion: reduce) {
  .hcA-rule { animation: none; transform: none; }
}
`;

/* The colophon. Three facts, no adjectives, set as a printer's note under the
 * closing rule so the page has a bottom edge instead of trailing off. */
const COLOPHON = [
  "One flat price, in rand",
  "Works on a bad connection",
  "Built for Android first",
];

export function HeroConceptA() {
  return (
    <section className="relative">
      <style href="hero-concept-a" precedence="medium">
        {CSS}
      </style>

      <div className="mx-auto w-full max-w-5xl px-5 py-20 md:px-8 md:py-32">
        <InView>
          {/* --------------------------- masthead ------------------------- */}
          <div aria-hidden className="h-px w-full bg-line-strong" />
          <p className="anim anim-rise mt-3 section-head">
            For South African teams of 2–15 people
          </p>

          {/* ------------------------- the type block --------------------- */}
          {/* Indented past the change bar, which hangs in the margin and lines
              up in x with the left end of the rule above it. */}
          <div className="mt-10 pl-4 sm:mt-14 sm:pl-8">
            {/* The rise lives on the wrapper, not the h1, so the change bar
                and the words travel together instead of drifting apart by the
                18px of the entry while it plays. */}
            <div
              className="anim anim-rise relative"
              style={{ animationDelay: "60ms" }}
            >
              <span
                aria-hidden
                className="anim hcA-rule absolute inset-y-0 -left-4 flex w-0.5 flex-col sm:-left-8"
                style={{ animationDelay: "200ms" }}
              >
                <span className="flex-1 bg-line-strong" />
                {/* Marks the last line: three lines on a phone, two on a
                    desktop, so the accent always covers the promise. */}
                <span className="h-1/3 shrink-0 bg-accent-line sm:h-1/2" />
              </span>

              <h1 className="hcA-head font-semibold text-ink-strong">
                The workspace{" "}
                <br aria-hidden className="sm:hidden" />
                that{" "}
                <br aria-hidden className="hidden sm:inline" />
                does the{" "}
                <br aria-hidden className="sm:hidden" />
                following up
                <span className="text-accent-quiet">.</span>
              </h1>
            </div>

            {/* The deck is deliberately a narrow column under a full-measure
                headline. That width difference is the composition. Its break is
                hand set too, on the comma, so the two parallel clauses stay on
                one line together instead of the browser splitting them. */}
            <p
              className="anim anim-rise mt-8 max-w-[34rem] text-lede text-muted sm:mt-10 sm:text-[1.1875rem]"
              style={{ animationDelay: "160ms" }}
            >
              A project workspace where work captures itself,{" "}
              <br aria-hidden className="hidden sm:inline" />
              status reports itself, and nobody has to ask twice.
            </p>

            <div
              className="anim anim-rise mt-9 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-7"
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
                className="press group inline-flex min-h-11 items-center justify-center font-medium text-ink sm:justify-start"
              >
                <span className="border-b border-line-strong pb-1 transition-colors group-hover:border-accent-line group-hover:text-accent-quiet">
                  See pricing
                </span>
              </Link>
            </div>
          </div>

          {/* --------------------------- colophon ------------------------- */}
          <div aria-hidden className="mt-16 h-px w-full bg-line sm:mt-24" />
          <ul
            className="anim anim-rise mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 section-head"
            style={{ animationDelay: "320ms" }}
          >
            {COLOPHON.map((fact, i) => (
              /* One line each on a phone with no slashes, because a wrapped
                 slash strands at a line edge and reads as a typo. On a wide
                 screen they run together as one rule of printer's marks. */
              <li
                key={fact}
                className="flex w-full items-center gap-x-3 sm:w-auto"
              >
                {i > 0 ? (
                  <span aria-hidden className="hidden text-faint-mark sm:inline">
                    /
                  </span>
                ) : null}
                {fact}
              </li>
            ))}
          </ul>
        </InView>
      </div>
    </section>
  );
}
