import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Alpha Workspace handles your information, plain language, POPIA-conscious.",
};

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
        terms of the Protection of Personal Information Act (POPIA).
      </p>

      <Section title="What we collect">
        <p>
          <span className="font-medium text-ink">Your account:</span> name,
          email address, and an avatar if your sign-in provider offers one.
        </p>
        <p>
          <span className="font-medium text-ink">Your workspace content:</span>{" "}
          projects, tasks, comments, labels, activity history, transcripts you
          approve, and the reports computed from them. This content belongs to
          your team, we process it only to run the product.
        </p>
        <p>
          <span className="font-medium text-ink">Technical basics:</span>{" "}
          session cookies (sign-in only, no advertising trackers) and standard
          server logs kept briefly for security and debugging.
        </p>
      </Section>

      <Section title="Voice capture">
        <p>
          When you use voice capture, the audio is transcribed to text so you
          can review and confirm the tasks we extract from it. Where your
          browser supports it, that happens on your device; otherwise the audio
          is sent to our transcription provider (Deepgram) to turn into text and
          is not retained by them afterwards. We keep the transcript, not a
          stored voice-capture recording. Discard a capture and it’s marked
          discarded; delete your workspace and it’s gone entirely.
        </p>
      </Section>

      <Section title="Meeting recording">
        <p>
          Meetings are an opt-in feature. When you record one, the audio is
          captured (on your device, or by a clearly-named notetaker that joins
          the online call as a visible participant so everyone can see it),
          uploaded to our storage, and transcribed.{" "}
          <span className="font-medium text-ink">
            Please tell everyone in the room they’re being recorded before you
            start
          </span>{" "}
          , it’s the law and it’s good manners. Recordings are private to
          whoever made them until shared, you can delete the audio and keep just
          the notes, and meeting audio for the notetaker-bot option is held
          briefly by our meeting-bot provider (Recall.ai) before we fetch it.
        </p>
      </Section>

      <Section title="AI processing">
        <p>
          Transcripts and weekly activity summaries are processed server-side
          through Anthropic’s API to extract task proposals and write your
          briefing. This data is not used to train AI models. AI credentials
          never reach your browser, and the AI never creates or changes work, a person always confirms first.
        </p>
      </Section>

      <Section title="Who else touches data">
        <p>
          We use a short list of operators, each doing one job: Supabase
          (database and file hosting), Vercel (application hosting), Resend
          (email delivery), Anthropic (AI processing as above), Deepgram
          (speech-to-text for voice captures and meetings), Recall.ai (the
          optional meeting notetaker bot), and PayFast (payments, card details
          go directly to PayFast and never touch Alpha’s servers). Some of
          these process data on servers outside South Africa (for example the
          United States); we only share what each needs to do its job. We don’t
          sell personal information. Ever.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can access and correct your information in the app. You can{" "}
          <span className="font-medium text-ink">export your data</span> as
          JSON (Account → Your data → Export), and you can{" "}
          <span className="font-medium text-ink">delete</span> your account or
          your whole workspace, deletion actually deletes, including
          transcripts, reports and activity history.
        </p>
        <p>
          Notifications are tunable per type and channel (Account →
          Notifications); external channels are outbound nudges only and never
          collect replies.
        </p>
        <p>
          Questions or complaints: raise them with your workspace owner or
          email the operator of this deployment. You may also approach the
          Information Regulator (South Africa), inforegulator.org.za.
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
