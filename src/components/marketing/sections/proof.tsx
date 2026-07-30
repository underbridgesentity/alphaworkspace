/**
 * "Proof": the real product, one scroll after the hero.
 *
 * The old page followed an editorial type hero with more type, and nothing
 * below it proved the product existed. This section's whole job is that
 * proof: a real screenshot of My Work from the seeded demo workspace, in the
 * page's single hairline-frame treatment (.mkt-frame, globals.css), cropped
 * at the card's bottom edge so it reads as a live app rather than a poster.
 *
 * Ground: the faint teal wash (.mkt-band-wash), the first move of the page's
 * band rhythm. The three callouts under the shot each name something that is
 * actually IN the pixels above them, and each wears the semantic colour of
 * the thing it points at: teal for the brief, gold for the due-today rail,
 * indigo for the private list. Colour with a job, not decoration.
 *
 * At 375px: a desktop screenshot at phone width is an unreadable postage
 * stamp, so the phone gets the real MOBILE screenshot instead, which is
 * exactly what the product will look like on the phone it is being read on.
 *
 * Art direction is a <picture> with a media-queried source, NOT two
 * CSS-hidden <Image>s: Chromium fetches display:none images anyway (measured,
 * it requested the hidden variant at its largest srcset candidate), so the
 * hidden-pair approach shipped BOTH bitmaps to every visitor. getImageProps
 * gives us next/image's optimizer URLs inside a real <picture>, and the
 * browser then fetches exactly one source. The type hero stays the LCP.
 */
import { getImageProps } from "next/image";
import { InView } from "@/components/marketing/in-view";
import { Reveal } from "@/components/marketing/reveal";
import { cn } from "@/lib/cn";

const CALLOUTS: Array<{ dot: string; label: string; body: string }> = [
  {
    dot: "bg-accent",
    label: "The brief writes itself",
    body: "06:30 every morning: what is due, what slipped, where to start. Nobody typed it.",
  },
  {
    dot: "bg-warn",
    label: "The rail reads the room",
    body: "Gold on the edge means due today, crimson means overdue. No status column to fill in.",
  },
  {
    dot: "bg-info",
    label: "A private list, actually private",
    body: "Your own tasks under your day. Invisible to everyone else, admins included.",
  },
];

export function Proof() {
  return (
    <section className="mkt-band-wash relative overflow-hidden border-y border-line">
      <div className="relative mx-auto w-full max-w-5xl px-5 py-chapter md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <p className="section-head">Straight out of the app</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-group text-balance text-display-sm sm:text-display">
              This is the screen your Monday starts on.
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-item text-pretty text-lede text-muted">
              One page holds your morning brief, today&rsquo;s work and your
              private list. Read the coloured rail down the left and you know
              what needs chasing before you read a word.
            </p>
          </Reveal>
        </div>

        <InView className="mt-section md:mt-chapter">
          {/* Desktop shot, cropped at the frame's bottom edge (the frame is
              shorter than the 16:10 bitmap; object-top keeps the brief card
              and the task list, drops the tail). */}
          <ProofShot />

          {/* Honesty caption: demo data is fine to show, never to dress up. */}
          <p className="anim anim-rise mt-item text-center text-meta text-faint">
            Mzansi Studio, the demo workspace. Real screens, seeded data.
          </p>
        </InView>

        {/* Three things that are actually in the pixels above. On a phone the
            grid stacks; each callout keeps its dot so the colour key holds. */}
        <div className="mt-section grid gap-group sm:grid-cols-3 sm:gap-8">
          {CALLOUTS.map((item, i) => (
            <Reveal key={item.label} delay={i * 90}>
              <div className="flex items-center gap-tight">
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-full", item.dot)}
                />
                <h3 className="section-head">{item.label}</h3>
              </div>
              <p className="mt-tight text-dense text-muted">{item.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}


/**
 * One <picture>, two sources, one download. Desktop gets the wide My Work
 * shot, phones get the real mobile shot at phone-sized candidates. The frame
 * box still owns the crop (absolute fill + object-top inside an aspect box),
 * matching the .mkt-frame treatment used by every other shot on the page.
 */
function ProofShot() {
  const common = { alt: "", sizes: "(min-width: 40rem) 60rem, 84vw" };
  const desktop = getImageProps({
    ...common,
    width: 2880,
    height: 1512,
    src: "/marketing/shots/my-work-desktop-light.png",
  });
  const mobile = getImageProps({
    ...common,
    width: 780,
    height: 1120,
    sizes: "84vw",
    src: "/marketing/shots/my-work-mobile-light.png",
  });
  return (
    <div className="anim anim-rise mx-auto w-full max-w-[21rem] sm:max-w-none">
      <div className="mkt-frame relative aspect-[390/560] sm:aspect-[16/8.4]">
        <picture>
          <source media="(min-width: 40rem)" srcSet={desktop.props.srcSet} sizes="60rem" />
          <source media="(max-width: 39.99rem)" srcSet={mobile.props.srcSet} sizes="84vw" />
          <img
            {...mobile.props}
            alt="My Work in Alpha Workspace: a morning brief card saying 'Morning Lerato, 2 due today. Start there.', task lists with coloured due-date rails, and a private list below"
            loading="lazy"
            className="absolute inset-0 size-full object-cover object-top"
          />
        </picture>
      </div>
    </div>
  );
}
