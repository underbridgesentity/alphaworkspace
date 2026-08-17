import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Alpha Workspace handles your information, plain language, POPIA-conscious.",
};

/*
 * This page is checked against the code, not written from memory. Two rules
 * when editing it:
 *
 *  1. A policy that overstates protection is a compliance problem, and one
 *     that understates it is a needless liability. Every sentence here should
 *     be traceable to something in src/server or src/lib.
 *  2. The store declarations in store/privacy/ must agree with this page.
 *     Play treats an inconsistency between the Data safety form and the policy
 *     as a rejection reason, and Apple reads the App Privacy answers against
 *     it. Change one, check the other.
 *
 * ACTION REQUIRED, JOSEPH: two statements below rest on contracts rather than
 * on code, and both need confirming in writing before the Data safety form is
 * submitted, because the service-provider carve-out depends on exactly them:
 *   - that Deepgram does not retain audio sent for transcription;
 *   - that Anthropic does not train on API content.
 * Nothing in src/server/ai sets a per-request retention or opt-out flag, so if
 * either vendor offers one, set it and this comment can go.
 *
 * The support address published here is the same one on /support, and that
 * mailbox still has to be created.
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

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-20 pt-10 md:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-muted">
        Plain language, because that’s how privacy should read. Alpha Workspace
        is the responsible party for personal information processed here, in
        terms of the Protection of Personal Information Act (POPIA). Reach us
        at{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="font-medium text-ink underline underline-offset-2"
        >
          {SUPPORT_EMAIL}
        </a>
        .
      </p>

      <Section title="What we collect">
        <p>
          <span className="font-medium text-ink">Your account:</span> name,
          email address, and an avatar if your sign-in provider offers one. If
          you sign in with Google, we also store the tokens Google issues for
          that connection so it keeps working. If you set a password, we store
          a hash of it, never the password itself.
        </p>
        <p>
          <span className="font-medium text-ink">Your workspace content:</span>{" "}
          projects, tasks, comments, labels, activity history, meeting
          transcripts and summaries, transcripts you approve, and the reports
          computed from them. This content belongs to your team, we process it
          only to run the product.
        </p>
        <p>
          <span className="font-medium text-ink">Technical basics:</span>{" "}
          session cookies (sign-in only, no advertising trackers), standard
          server logs kept briefly for security and debugging, and, if you turn
          push notifications on, a registration token identifying that browser
          or device.
        </p>
      </Section>

      <Section title="Voice capture">
        <p>
          When you use voice capture, the audio is transcribed to text so you
          can review and confirm the tasks we extract from it.{" "}
          <span className="font-medium text-ink">
            By default the recording is sent to our transcription provider,
            Deepgram, to be turned into text.
          </span>{" "}
          Under our agreement with them it is transcribed and not kept
          afterwards. We keep the transcript, not a stored voice-capture
          recording. Discard a capture and it’s marked discarded; delete your
          account or your workspace and it’s gone.
        </p>
        <p>
          Each transcription request also carries a short vocabulary list built
          from your workspace: teammates’ names, project names, client names
          and label names. It is what makes local names come out spelled right,
          and it is sent whether or not the recording mentions any of them.
        </p>
        <p>
          If a device can’t record for us, we fall back to the speech
          recognition built into your browser.{" "}
          <span className="font-medium text-ink">
            That fallback is not private to your device:
          </span>{" "}
          Chrome and other Chromium browsers stream the microphone to Google’s
          speech service to do the recognising. This affects the website only.
          The Android and iOS apps have no such browser feature, so there the
          Deepgram path is the only one.
        </p>
      </Section>

      <Section title="Meeting recording">
        <p>
          Meetings are an opt-in feature. When you record one, the audio is
          captured (on your device, or by a clearly-named notetaker that joins
          the online call as a visible participant so everyone can see it) and
          uploaded to our storage.{" "}
          <span className="font-medium text-ink">
            Please tell everyone in the room they’re being recorded before you
            start
          </span>
          , it’s the law and it’s good manners.
        </p>
        <p>
          <span className="font-medium text-ink">
            Meeting audio leaves our infrastructure.
          </span>{" "}
          The recording is stored with Supabase, our database and file host,
          and Deepgram fetches it from there to transcribe it. The transcript
          is then sent to Anthropic to write the summary and propose action
          items. If you use the notetaker bot instead of recording on your own
          device, Recall.ai captures the call and holds the audio briefly
          before we copy it across.
        </p>
        <p>
          Recordings are private to whoever made them, admins included, until
          they share the notes or link the meeting to a project. You can delete
          the audio at any point and keep just the notes, which removes the
          recording from storage. Action items stay proposals until a person
          confirms them.
        </p>
      </Section>

      <Section title="AI processing">
        <p>
          Transcripts, typed quick-adds and weekly activity summaries are
          processed server-side through Anthropic’s API to extract task
          proposals and write your briefing. To attribute work to the right
          person, those requests also include the{" "}
          <span className="font-medium text-ink">
            names of everyone in the workspace
          </span>
          , whether or not the content mentions them. We do not send members’
          email addresses. Anything you type or say is sent as you wrote it, so
          an address inside a note or a recording goes with it. Under Anthropic’s
          commercial terms this data is not used to train their models. AI
          credentials never reach your browser, and the AI never creates or
          changes work, a person always confirms first.
        </p>
      </Section>

      <Section title="Who else touches data">
        <p>
          We use a short list of operators, each doing one job:
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <span className="font-medium text-ink">Supabase</span>, the database
            and the file storage behind attachments and meeting audio.
          </li>
          <li>
            <span className="font-medium text-ink">Vercel</span>, application
            hosting.
          </li>
          <li>
            <span className="font-medium text-ink">Resend</span>, email
            delivery: sign-in links, invites, nudges and meeting notes.
          </li>
          <li>
            <span className="font-medium text-ink">Anthropic</span>, the
            summaries and task extraction described above.
          </li>
          <li>
            <span className="font-medium text-ink">Deepgram</span>,
            speech-to-text for voice captures and meetings.
          </li>
          <li>
            <span className="font-medium text-ink">Recall.ai</span>, the
            optional meeting notetaker bot, only if your workspace has it
            switched on.
          </li>
          <li>
            <span className="font-medium text-ink">PayFast</span>, payments.
            Card details go directly to PayFast and never touch Alpha’s
            servers. The payment notification PayFast sends us afterwards is
            stored for audit, and it includes the payer’s name and email
            address.
          </li>
          <li>
            <span className="font-medium text-ink">Google</span>, in three
            separate roles: sign-in, if you use it; hosting the avatar image
            that comes with a Google account, which means your browser fetches
            it from Google whenever you view that person’s avatar; and Firebase
            Cloud Messaging, which carries push notifications to the Android
            and iOS apps. Push to an iPhone reaches Apple through Firebase, so
            the device token and the text of the notification pass through
            Google on both platforms.
          </li>
          <li>
            <span className="font-medium text-ink">
              Your browser’s push service
            </span>{" "}
            (Google, Mozilla or Apple, depending on the browser), if you enable
            push on the website. The contents are encrypted, but the service
            necessarily sees that a message was delivered to your browser.
          </li>
        </ul>
        <p>
          Some of these process data on servers outside South Africa (for
          example the United States); we only share what each needs to do its
          job. We don’t sell personal information. Ever.
        </p>
      </Section>

      <Section title="What you can take with you">
        <p>
          You can export your data as JSON at any time, from Account, Your
          data, Export. The file contains your profile, your workspace
          memberships, tasks assigned to you, tasks you created, your comments,
          your voice captures, your notifications and your private tasks.
        </p>
        <p>
          It does not currently include everything: meetings and their
          transcripts, attachments, time entries, scorecard entries and
          activity history are not in the automatic export. Ask us at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-ink underline underline-offset-2"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          and we will put those together for you.
        </p>
      </Section>

      <Section title="What deletion does">
        <p>
          You can delete your account, and an owner can delete a whole
          workspace, from inside the product. Deleting your account removes
          your profile, your sign-in credentials and sessions, your private
          tasks, your voice captures, your logged time, your notification
          preferences and history, your push registrations, and the meetings
          you recorded together with their transcripts and summaries. A
          workspace you solely own, with nobody else in it, goes too, and
          everything in it with it.
        </p>
        <p>
          Two things deliberately survive.{" "}
          <span className="font-medium text-ink">
            Work you authored in a workspace that other people still use stays
            with that workspace, with your name taken off it
          </span>
          , so the team keeps its record of its own projects without keeping
          you in it. And the activity log stays as de-identified history,
          because the scorecards and the weekly narrative are computed from it;
          after deletion those entries point at nobody.
        </p>
        <p>
          Billing records are kept for as long as South African tax and company
          law requires us to keep them.
        </p>
        <p>
          <Link
            href="/delete-account"
            className="font-medium text-ink underline underline-offset-2"
          >
            The full deletion process is written out here
          </Link>
          , including what to do if you can no longer sign in.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can access and correct your information in the app, export it,
          and delete it, as above. Notifications are tunable per type and
          channel (Account, Notifications); external channels are outbound
          nudges only and never collect replies.
        </p>
        <p>
          Questions or complaints: raise them with your workspace owner, or
          write to us at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-ink underline underline-offset-2"
          >
            {SUPPORT_EMAIL}
          </a>
          . You may also approach the Information Regulator (South Africa),
          inforegulator.org.za.
        </p>
      </Section>

      <Section title="Consent">
        <p>
          Creating an account is your consent to process the information above
          for the purpose of running Alpha Workspace, nothing broader. This
          page changes only with notice in the product.
        </p>
      </Section>
    </div>
  );
}
