/**
 * The founder note: our honest substitute for the logo wall and the
 * testimonial carousel, neither of which we will fabricate.
 *
 * The pattern is Basecamp's: when you cannot borrow trust from customers you
 * have not got, spend your own. Short, signed, and it only makes claims a
 * reader could check by using the product. The refusals are the load-bearing
 * part: a product that says what it will not become is easier to believe
 * about what it is.
 *
 * Ground: the warm paper tint, rhyming with the capture band earlier, so the
 * page's two most human moments share a colour. Set as a letter: narrow
 * measure, a hanging rule in the margin like the hero's change bar, sign-off
 * instead of a CTA. The next section is pricing; this one deliberately asks
 * for nothing.
 *
 * At 375px: it is a column of text at reading measure. Nothing to collapse,
 * nothing hidden.
 */
import { Reveal } from "@/components/marketing/reveal";

export function FounderNote() {
  return (
    <section className="mkt-band-paper relative overflow-hidden border-y border-line">
      <div className="relative mx-auto w-full max-w-5xl px-5 py-chapter md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <p className="section-head">From the founder</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-group text-balance text-display-sm sm:text-display">
              Why this exists
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-item space-y-item border-l-2 border-warn/40 pl-5 text-pretty text-lede text-muted sm:pl-7">
              <p>
                Small agencies here do not lose their week to the work. They
                lose it to the chasing: the Thursday &ldquo;any update?&rdquo;
                messages, the Monday scramble to remember what actually
                happened, the status report assembled at 21:00 for a client
                who needed it at 09:00.
              </p>
              <p>
                So this is deliberately a small product that does one job: it
                does the following up, so nobody on your team has to be the
                person who nags. It will not become an automations builder, a
                docs system or a WhatsApp bot that answers for you. The AI in
                it drafts and proposes; a human always confirms. And the free
                band is free forever, because a three-person studio should be
                able to try better software without a procurement meeting.
              </p>
              <p>
                If it does not reduce the number of messages your team sends
                about work, it has failed. That is the whole bet.
              </p>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-group pl-5 text-body font-medium text-ink sm:pl-7">
              Joseph
              <span className="mt-hair block text-meta font-normal text-faint">
                Founder, Alpha Workspace
              </span>
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
