/**
 * Hero, concept B: ONE HONEST ARTIFACT.
 *
 * The right-hand side is not a collage and not a card. It is a single printed
 * object: the Monday brief this product issues by itself, drawn as a docket
 * on a slip of paper, with a ruled margin, full-bleed rules, a perforated
 * tear-off, and a colophon at the foot.
 *
 * Why a docket and not a card:
 *  - square corners, full-bleed rules and a printed margin column are the
 *    grammar of forms and dockets. Inset rules and 12px radii are the grammar
 *    of the SaaS card collage we are replacing.
 *  - the vertical margin rule is the design system's own follow-up rail
 *    (globals.css, SIGNATURE 1) turned vertical: where a project needs
 *    attention, that 2px segment of the rule takes colour, so you read the
 *    week down the margin before you read a word.
 *  - the number sits on the ledger line (SIGNATURE 2), used exactly once.
 *  - the perforation splits the object into its two honest halves: what
 *    happened (above), and what the workspace already did about it (below).
 *    That lower half IS the positioning, printed on the thing itself.
 *
 * Motion: three moments, all meaning something, all transform/opacity, all
 * one-shot and gated by <InView>, all collapsed by prefers-reduced-motion via
 * the global rule at the foot of globals.css.
 *   1. the slip rises in once: it lands on the desk.
 *   2. the ledger bar grows: the number measures itself.
 *   3. the three follow-ups arrive in sequence: they went out one after
 *      another, while nobody was watching.
 * Nothing bobs, nothing floats, nothing loops (except the section streak,
 * which is a background gradient and already part of the system).
 *
 * 375px: the slip survives whole, because it was drawn portrait and
 * single-column to begin with. It goes full-bleed to the page gutter, the
 * internal padding tightens, and nothing is dropped or re-flowed. The margin
 * column stays, because it is the design.
 *
 * Server component. No raster images, no filters, no blur, no client JS
 * beyond the shared <InView> observer.
 */
import Link from "next/link";
import type { CSSProperties } from "react";
import { Bell, Mail } from "lucide-react";
import { InView } from "@/components/marketing/in-view";

/* Content column starts at the margin rule (--mx) plus a printer's indent. */
const GUTTER = "pl-[calc(var(--mx)+0.875rem)] pr-4 sm:pr-5";

/* Paper: a static background gradient, the sheet falling away at the foot.
   Gradients live on backgrounds, never on text. */
const PAPER: CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, var(--surface) 0%, color-mix(in oklab, var(--bg) 45%, var(--surface)) 100%)",
};

/* A real perforation is holes, not a dashed line. 2px on, 5px off, 1px tall. */
const PERFORATION: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(90deg, var(--line-strong) 0 2px, transparent 2px 7px)",
};

/** The `rail` utility reads var(--rail); set the tone honestly per row rather
 *  than borrowing a rail-* class whose name means something else. */
function rail(tone: string): CSSProperties {
  return { "--rail": tone } as CSSProperties;
}

/* The week, three lines. Margin figure = days since anything moved there. */
const LEDGER = [
  {
    age: "6d",
    project: "Sable rebrand",
    state: "4 open, none touched",
    tone: "var(--warn)", // gold, never orange
  },
  {
    age: "2d",
    project: "Karoo Coffee retainer",
    state: "invoice signed",
    tone: "var(--ok)",
  },
  {
    age: "1d",
    project: "Highveld Bank pitch",
    state: "reply due Thu",
    tone: "var(--accent-line)",
  },
];

/* The tear-off half: what the workspace sent so no human had to. */
const FOLLOW_UPS = [
  { icon: Bell, text: "Nudged Thabo about Sable", time: "Fri 16:40" },
  { icon: Mail, text: "Reminded Naledi, Karoo report", time: "Sun 18:00" },
  { icon: Mail, text: "Chased Highveld for sign-off", time: "06:30" },
];

function MondayBrief() {
  return (
    <figure className="mx-auto w-full max-w-[25rem] md:ml-auto md:mr-0">
      <article
        style={{ ...PAPER, animationDelay: "200ms" }}
        className="anim anim-rise relative rounded-[2px] bg-surface shadow-e3 [--mx:2.5rem]"
      >
        {/* masthead band: issue metadata, the way a printed form carries it */}
        <header className="flex items-baseline justify-between rounded-t-[2px] border-b border-line-strong bg-sunken px-4 py-2.5 sm:px-5">
          <span className="section-head">Monday brief</span>
          <span className="tabular text-micro text-faint">Week 30</span>
        </header>

        {/* ruled area: one continuous margin rule runs to the foot of the
            sheet, through the perforation, exactly as a column rule does on a
            printed form. Rows overpaint their segment of it in colour. No
            bottom padding here on purpose: inset-y-0 has to carry the rule all
            the way to the trim, the way a column rule runs off a printed
            sheet. The colophon supplies the foot margin. */}
        <div className="relative">
          <span
            aria-hidden
            className="absolute inset-y-0 left-[var(--mx)] w-px bg-line-strong"
          />

          {/* the lede: one number, on the ledger line, used once */}
          <div className={`${GUTTER} pt-5`}>
            <p className="num-hero ledger tabular text-ink">
              14
              <span className="text-lede font-medium text-muted"> of 19</span>
              <span className="ledger-track">
                {/* hand-rolled fill rather than .ledger-fill: that utility
                    drives scaleX from --fill, which would fight the growth
                    animation for the same transform. Width carries the share,
                    the animation carries the meaning. */}
                <span
                  className="anim anim-grow-x block h-full w-[74%] rounded-full bg-accent-line"
                  style={{ animationDelay: "900ms" }}
                />
              </span>
            </p>
            <p className="mt-2 text-micro text-faint">
              tasks closed, week of 20 July
            </p>

            <p className="mt-4 text-dense text-ink">
              A good week, with one hole in it. Nothing on Sable has moved in
              six days, and all four open items there sit with Thabo.
            </p>
          </div>

          {/* the week, ruled */}
          <p className={`${GUTTER} mt-5 section-head`}>
            What moved, and what did not
          </p>
          <ul className="mt-2 border-t border-line">
            {LEDGER.map((row) => (
              <li
                key={row.project}
                className="flex items-stretch border-b border-line pr-4 last:border-b-0 sm:pr-5"
              >
                {/* pt-3, not pt-2.5: an 11px figure needs 2px more to land
                    its baseline on the 13px project name beside it */}
                <span className="w-[var(--mx)] shrink-0 pr-2 pt-3 text-right tabular text-micro text-faint">
                  {row.age}
                </span>
                <span
                  style={rail(row.tone)}
                  className="rail flex min-w-0 flex-1 items-baseline gap-3 py-2.5 pl-3.5"
                >
                  <span className="min-w-0 flex-1 truncate text-dense font-medium text-ink">
                    {row.project}
                  </span>
                  <span className="shrink-0 text-micro text-faint">
                    {row.state}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {/* the tear: holes punched through, notches bitten out of both
              edges, so the outline of the sheet breaks where it separates */}
          <div className="relative py-4">
            <span
              aria-hidden
              style={PERFORATION}
              className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
            />
            <span
              aria-hidden
              className="absolute -left-[7px] top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-bg"
            />
            <span
              aria-hidden
              className="absolute -right-[7px] top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-bg"
            />
          </div>

          {/* the stub: the half the product wrote actions into. The only teal
              text on the sheet, because this is the half that is the promise. */}
          {/* colour set inline: `section-head` hard-codes var(--faint), and a
              same-specificity text-* utility is not guaranteed to sort after
              a custom @utility */}
          <p
            className={`${GUTTER} section-head`}
            style={{ color: "var(--accent-quiet)" }}
          >
            Follow-ups sent
          </p>
          <ul className="mt-1.5">
            {FOLLOW_UPS.map((item, i) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.text}
                  style={{ animationDelay: `${1050 + i * 130}ms` }}
                  className="anim anim-rise flex items-start py-1.5 pr-4 sm:pr-5"
                >
                  {/* pt-0.5 centres a 14px mark on the 18.5px line box of the
                      13px text beside it. faint-mark is the token reserved for
                      non-text marks like this. */}
                  <span className="flex w-[var(--mx)] shrink-0 justify-end pr-2 pt-0.5">
                    <Icon
                      aria-hidden
                      strokeWidth={1.75}
                      className="size-3.5 text-faint-mark"
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-2 pl-3.5">
                    <span className="min-w-0 flex-1 truncate text-dense text-ink">
                      {item.text}
                    </span>
                    <span className="shrink-0 tabular text-micro text-faint">
                      {item.time}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {/* colophon: the proof, printed small at the foot like a real one */}
          <div className={`${GUTTER} mt-4 border-t border-line pb-4 pt-3`}>
            <p className="text-micro text-faint">
              Compiled 06:30, Mon 27 Jul. Nobody was asked for an update.
            </p>
          </div>
        </div>
      </article>

      <figcaption className="sr-only">
        Example of the Monday brief Alpha Workspace writes and sends by itself:
        what closed, which client project has gone quiet, and the follow-up
        messages it already sent on the team&rsquo;s behalf.
      </figcaption>
    </figure>
  );
}

export function HeroConceptB() {
  return (
    <section className="relative overflow-hidden">
      {/* background wash only, kept behind the copy so it never sits under
          the paper and tints the punched notches */}
      <div aria-hidden className="streak left-[-14%] top-[26%]" />

      <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <InView className="grid items-center gap-10 md:grid-cols-[1.02fr_0.98fr] md:gap-12">
          {/* ------------------------------ copy ------------------------------ */}
          <div>
            <p className="anim anim-rise w-fit rounded-full border border-dashed border-line-strong px-3.5 py-1 text-meta font-medium text-muted">
              For South African teams of 2-15 people
            </p>

            <h1
              className="anim anim-rise mt-6 text-balance text-[2.625rem] font-semibold leading-[1.02] tracking-[-0.034em] sm:text-display-lg lg:text-[3.5rem]"
              style={{ animationDelay: "80ms" }}
            >
              The workspace that does the following up.
            </h1>

            <p
              className="anim anim-rise mt-5 max-w-md text-pretty text-lede text-muted"
              style={{ animationDelay: "160ms" }}
            >
              Alpha Workspace chases the updates, writes the status report, and
              keeps working when the signal drops. One flat price for the whole
              team, in rand.
            </p>

            <div
              className="anim anim-rise mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                href="/sign-in"
                className="press rounded-[0.625rem] bg-accent px-6 py-3 text-center font-semibold text-on-accent hover:bg-accent-hover"
              >
                Start free, no card
              </Link>
              <Link
                href="/pricing"
                className="press rounded-[0.625rem] border border-dashed border-line-strong px-6 py-3 text-center font-medium text-ink transition-colors hover:bg-sunken"
              >
                See pricing
              </Link>
            </div>
          </div>

          {/* ---------------------------- the artifact ------------------------ */}
          <MondayBrief />
        </InView>
      </div>
    </section>
  );
}
