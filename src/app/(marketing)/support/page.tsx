import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { SUPPORT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Support",
  description:
    "How to get help with Alpha Workspace: one email address, answered within a working day, plus plain answers to the questions that come up most.",
};

/*
 * The published support address lives in @/lib/contact, not here, because it
 * also appears on /privacy and /delete-account and on both store listings. One
 * constant means a change cannot leave a stale address on one of them.
 *
 * It is info@underbridges.co.za: an inbox that already exists and is already
 * read. Neither store requires the address to sit on the app's own domain,
 * only that it reaches a person, and Apple does email it during review.
 */

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do I add someone to my workspace?",
    a: (
      <>
        Owners and admins invite people from Settings, Members. An email invite
        goes to one address and has to be accepted by that address; it expires
        after 14 days. A shared invite link lets anyone holding it join, lasts
        90 days, and can be revoked whenever you like. Pending invites count
        towards your plan&rsquo;s people limit, so a full workspace has to
        revoke one before sending another.
      </>
    ),
  },
  {
    q: "An invite never arrived.",
    a: (
      <>
        Check the spam folder first. If it is older than 14 days it has already
        expired, and an admin can send a fresh one. An invite addressed to one
        person cannot be accepted while you are signed in as someone else, so
        sign in with the address the invite was sent to and open the link
        again.
      </>
    ),
  },
  {
    // Deliberately no "do it on the web instead" instruction here. This page
    // is public, so a store shell can reach it by deep link, and telling a
    // reader to go elsewhere to pay is the exact directive Apple 3.1.3(f) and
    // Play Billing prohibit. Describing how billing already works is fine.
    q: "How does billing work?",
    a: (
      <>
        Your plan lives under Settings, Billing in your workspace. Payment runs
        through PayFast as a debit order off a card, in rand, VAT inclusive.
        Card details go straight to PayFast and never touch our servers.
        Nothing is charged per seat, so adding a teammate does not change the
        number.
      </>
    ),
  },
  {
    q: "How do I get a copy of my data?",
    a: (
      <>
        Account, Your data, then &ldquo;Export my data (JSON)&rdquo;. It
        downloads straight away, with nothing to request and nothing to wait
        for. The file holds your profile, your workspace memberships, tasks
        assigned to you and tasks you created, your comments, your voice
        captures, your notifications and your private tasks. If you need
        something that is not in there, meeting transcripts for example, write
        to us and we will put it together for you.
      </>
    ),
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        Account, then Delete my account. Type your email address to confirm and
        choose Delete forever. It is permanent.{" "}
        <Link href="/delete-account" className="font-medium text-ink underline underline-offset-2">
          What deletion removes and what it keeps
        </Link>{" "}
        is worth reading first. If you solely own a workspace that still has
        other people in it, hand ownership over before you delete, in that
        workspace&rsquo;s Settings, Members, using &ldquo;Make owner&rdquo;.
      </>
    ),
  },
  {
    q: "I cannot sign in.",
    a: (
      <>
        There are three doors and they all lead to the same account: an emailed
        sign-in link, a password if you have set one, and Google in a browser.
        If the link has not arrived, check spam. If you have forgotten a
        password, use the email link instead and set a new one under Account.
        If you no longer have access to the email address itself, write to us
        from an address your team can vouch for and we will help.
      </>
    ),
  },
  {
    q: "The app says I am offline. Have I lost work?",
    a: (
      <>
        No. Reads come from the cache and writes queue on the device, then send
        themselves when the connection returns, even if you have closed the
        app. Anything still waiting is shown to you rather than hidden. The one
        deliberate exception is billing, which never queues, because a payment
        that applies silently hours later is worse than one that fails now.
      </>
    ),
  },
  {
    q: "Who can see a meeting I recorded?",
    a: (
      <>
        Only you, until you say otherwise. Meetings are private to whoever
        recorded them, admins included, until you share the notes or link the
        meeting to a project, which makes it visible to the workspace. Action
        items stay proposals until you confirm them, and only then do they
        become ordinary tasks everyone can see.
      </>
    ),
  },
  {
    q: "When do the briefs and the weekly narrative arrive?",
    a: (
      <>
        The morning brief and the daily nudges go out at 06:00 SAST, one
        batched send per person, never one ping per task. The weekly narrative
        is written and delivered at 06:30 on Monday. Both are tunable per
        channel under Account, Notifications.
      </>
    ),
  },
];

export default function SupportPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-20 pt-10 md:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Support</h1>
      <p className="mt-2 text-lede text-muted">
        Something broken, or something that does not make sense? Write to a
        person. There is no ticket queue in front of us and no robot answering
        first.
      </p>

      <section className="mt-8 rounded-card border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold tracking-tight">Get help</h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          Email us and a human reads it.
        </p>
        <p className="mt-4">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="press inline-flex items-center gap-2 rounded-[0.625rem] bg-accent px-5 py-3 font-semibold text-on-accent hover:bg-accent-hover"
          >
            <Mail aria-hidden className="size-4" />
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
          <span className="font-medium text-ink">
            We answer within one working day, South African hours.
          </span>{" "}
          Weekends and public holidays roll over to the next working day.
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          It helps to tell us the name of your workspace, what you were doing,
          what you expected, and what happened instead. Roughly when it
          happened is usually enough for us to find it in the logs. Never send
          us your password; we will never ask for it.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">
          Answers, before you write
        </h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          These are the questions that actually come up.
        </p>
        <div className="mt-4 space-y-2">
          {FAQ.map((item, i) => (
            <Reveal key={item.q} delay={i * 50}>
              <details className="group rounded-card border border-dashed border-line bg-surface px-4 py-3 transition-colors open:border-line-strong hover:border-line-strong">
                <summary className="cursor-pointer select-none text-sm font-medium">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Also useful</h2>
        <ul className="mt-3 space-y-2 text-[0.9375rem] leading-relaxed text-muted">
          <li>
            <Link href="/privacy" className="font-medium text-ink underline underline-offset-2">
              Privacy and POPIA
            </Link>
            , what we hold, who else touches it, and what your rights are.
          </li>
          <li>
            <Link
              href="/delete-account"
              className="font-medium text-ink underline underline-offset-2"
            >
              Deleting your account
            </Link>
            , what goes, what stays, and how to ask if you cannot sign in.
          </li>
          <li>
            <Link href="/pricing" className="font-medium text-ink underline underline-offset-2">
              Pricing
            </Link>
            , the bands, what each includes, and what happens when you cancel.
          </li>
        </ul>
        <p className="mt-6 text-[0.9375rem] leading-relaxed text-muted">
          Unhappy with how we have handled your information? Raise it with us
          first at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-ink underline underline-offset-2"
          >
            {SUPPORT_EMAIL}
          </a>
          . You may also approach the Information Regulator of South Africa,
          inforegulator.org.za.
        </p>
      </section>
    </div>
  );
}
