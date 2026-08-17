import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Delete your account",
  description:
    "How to delete your Alpha Workspace account, what deletion removes, what stays with your team and why, and how to ask if you can no longer sign in.",
};

/*
 * This page exists because the deletion control itself lives at /account, which
 * is behind the sign-in wall (src/proxy.ts). Google Play requires the account
 * deletion URL on a listing to be reachable WITHOUT signing in, so a reviewer
 * who lands here must be able to read the whole process without an account.
 *
 * It is therefore a PUBLIC, static page: no session, no data fetching, nothing
 * that could bounce a signed-out visitor. Keep it that way.
 *
 * ACTION REQUIRED, JOSEPH: support@alphaworkspace.co.za below is the same
 * mailbox /support publishes and it still has to be created. See the note on
 * that page.
 */
const SUPPORT_EMAIL = "support@alphaworkspace.co.za";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-[0.9375rem] leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

export default function DeleteAccountPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-20 pt-10 md:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">
        Deleting your account
      </h1>
      <p className="mt-2 text-lede text-muted">
        You can delete your Alpha Workspace account yourself, from inside the
        product, without asking anyone. This page explains exactly what that
        does before you do it.
      </p>

      <Section title="How to delete it">
        <p>
          Sign in, open{" "}
          <Link href="/account" className="font-medium text-ink underline underline-offset-2">
            Account
          </Link>
          , and scroll to <span className="font-medium text-ink">Delete my
          account</span>. Type your email address into the confirmation box and
          choose <span className="font-medium text-ink">Delete forever</span>.
          The same screen is in the web app and in the Android and iOS apps.
        </p>
        <p>
          Deletion happens the moment you confirm. There is no queue, no
          cooling-off window and no undo, so take the export first if you want
          a copy: Account, Your data, Export my data (JSON).
        </p>
      </Section>

      <Section title="It is permanent">
        <p>
          We cannot restore a deleted account, and neither can you. Signing up
          again with the same email address gives you a new, empty account, not
          your old one back. Your teammates cannot recover it for you either.
        </p>
      </Section>

      <Section title="What is removed">
        <p>
          Your personal record goes entirely: your name, your email address,
          your avatar, your password, any Google sign-in you had connected, and
          every session, so you are signed out everywhere at once.
        </p>
        <p>
          So does everything that is only yours: your private tasks (the
          personal list on My Work that nobody else can see), your voice
          captures and their transcripts, your logged time, your notification
          preferences and history, your morning briefs, and the device
          registrations that let us send you push notifications.
        </p>
        <p>
          Meetings you recorded go with you, along with their transcripts,
          summaries and speaker names, because a recording belongs to the
          person who made it. If you want a recording gone sooner than that,
          you can delete the audio from the meeting itself at any time and keep
          only the notes.
        </p>
        <p>
          A workspace you solely own, with no other members left in it, is
          deleted too, and everything in it goes with it: projects, tasks,
          comments, labels, scorecards and reports.
        </p>
      </Section>

      <Section title="What stays with your team, and why">
        <p>
          If you were part of a workspace that other people still use, the work
          you did there stays with that workspace, with your name taken off it.
          Tasks you created, comments you wrote and scorecard entries you
          logged remain readable to the team; the attribution is anonymised, so
          what is left is the work, not the person. A team&rsquo;s record of its
          own projects should not develop holes because somebody left, and your
          colleagues cannot consent on your behalf to keeping your name on it
          either.
        </p>
        <p>
          The activity log is kept for the same reason and in the same shape.
          It is append-only history, the scorecards and the weekly narrative
          are computed from it, and after deletion its entries no longer point
          at any person.
        </p>
        <p>
          Billing records are kept where the law requires it. If a workspace
          has paid us, the payment notifications and the invoice trail behind
          them are retained for as long as South African tax and company law
          says we must keep them. Those records carry the payer&rsquo;s name and
          email address, and we cannot delete them on request while that
          obligation runs.
        </p>
      </Section>

      <Section title="If you own a workspace that still has people in it">
        <p>
          Deletion stops and tells you so. Hand ownership to someone else
          first, in that workspace&rsquo;s Settings, Members, using &ldquo;Make
          owner&rdquo;, then delete your account. This is deliberate: nobody
          should be able to erase a working team by closing their own account.
        </p>
        <p>
          If you would rather the whole workspace went, an owner can delete it
          from that workspace&rsquo;s settings. That removes it for everyone in
          it, not only for you.
        </p>
      </Section>

      <Section title="If you cannot sign in">
        <p>
          Email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-ink underline underline-offset-2"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          from the address on the account, with the words &ldquo;delete my
          account&rdquo; in the subject line, and we will do it for you. We
          answer within one working day, South African hours. We may ask you
          one or two questions to be sure the request is really yours, because
          the alternative is that anyone can close your account by writing us a
          letter.
        </p>
        <p>
          If you have lost access to the email address itself, say so and tell
          us the workspace name; we will find another way to establish that the
          account is yours before we touch it.
        </p>
      </Section>

      <Section title="More">
        <p>
          <Link href="/privacy" className="font-medium text-ink underline underline-offset-2">
            Privacy and POPIA
          </Link>{" "}
          sets out what we hold, who else processes it, and the rest of your
          rights.{" "}
          <Link href="/support" className="font-medium text-ink underline underline-offset-2">
            Support
          </Link>{" "}
          is where to go for anything else.
        </p>
      </Section>
    </div>
  );
}
