/**
 * TEMPORARY comparison route for choosing a hero. Renders the three candidate
 * directions one after another so they can be screenshotted at the same width
 * and judged against each other rather than described.
 *
 * DELETE THIS FILE once a hero is chosen. It is noindex'd so it cannot leak
 * into search results while it exists.
 */
import type { Metadata } from "next";
import { HeroConceptA } from "@/components/marketing/sections/hero-concept-a";
import { HeroConceptB } from "@/components/marketing/sections/hero-concept-b";
import { HeroConceptC } from "@/components/marketing/sections/hero-concept-c";

export const metadata: Metadata = {
  title: "Hero preview",
  robots: { index: false, follow: false },
};

const LABELS = [
  { id: "a", name: "A, editorial", node: <HeroConceptA /> },
  { id: "b", name: "B, one artifact", node: <HeroConceptB /> },
  { id: "c", name: "C, the problem felt", node: <HeroConceptC /> },
];

export default function HeroPreviewPage() {
  return (
    <div>
      {/* Scroll-reveal is disabled HERE ONLY. Three heroes stacked on one page
          means the lower two sit below the fold behind an entry animation, and
          concept C's reveal does not fire at all once scrolled to (a real bug
          in C, to fix if C is chosen). For choosing between them, every
          concept should be judged in its settled state, not its arrival. */}
      <style>{`.anim{opacity:1!important;transform:none!important;animation:none!important}`}</style>
      {LABELS.map((l) => (
        <section key={l.id} id={l.id}>
          <p className="bg-ink px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-bg">
            {l.name}
          </p>
          {l.node}
        </section>
      ))}
    </div>
  );
}
