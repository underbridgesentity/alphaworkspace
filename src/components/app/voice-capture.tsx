"use client";

/**
 * Voice capture: hold a thought for ninety seconds, get a reviewable task
 * list. Live on-device transcription (Web Speech API) with a typed fallback
 * where it's unsupported. Audio is never stored. POPIA by design.
 */
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TaskProposal } from "@/lib/types";
import { apiMutate, ApiError } from "@/lib/client/api";
import { raiseLimit } from "@/lib/client/tasks";
import { useWorkspace } from "@/lib/client/workspace";
import {
  createTranscriptionProvider,
  transcriptionSupported,
  type TranscriptionProvider,
} from "@/lib/client/transcription";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { ProposalReview } from "./proposal-review";

interface ExtractResponse {
  captureId: string;
  proposals: TaskProposal[];
  engine: string;
}

type Phase =
  | "idle"
  | "recording"
  | "transcribing"
  | "review"
  | "extracting"
  | "proposals";

export function VoiceCaptureSheet({
  defaultProjectId,
  onClose,
}: {
  defaultProjectId?: string;
  onClose: () => void;
}) {
  const { workspace, usage, serverTranscribe } = useWorkspace();
  const { toast } = useToast();
  const supported = transcriptionSupported();
  const [phase, setPhase] = useState<Phase>(supported ? "idle" : "review");
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const providerRef = useRef<TranscriptionProvider | null>(null);

  const capturesLeft =
    usage.limits.voiceCapturesPerMonth - usage.voiceCapturesThisMonth;

  useEffect(() => () => providerRef.current?.stop(), []);

  const start = (forceOnDevice = false) => {
    const provider = createTranscriptionProvider({
      serverSlug: !forceOnDevice && serverTranscribe ? workspace.slug : null,
    });
    providerRef.current = provider;
    setPhase("recording");
    void provider.start({
      onResult: (final, live) => {
        // Server provider appends its transcript; keep prior text on re-record.
        // Empty `final` is a status placeholder ("Listening…") — never let it
        // wipe what's already committed.
        setFinalText((prev) =>
          provider.kind === "server-deepgram"
            ? final
              ? prev
                ? `${prev} ${final}`
                : final
              : prev
            : final,
        );
        setInterim(live);
      },
      onEnd: () => {
        setInterim("");
        setPhase((p) =>
          p === "recording" || p === "transcribing" ? "review" : p,
        );
      },
      onError: (message) => {
        // Server transcription unavailable at runtime, retry on-device.
        if (message === "__fallback__") {
          start(true);
          return;
        }
        toast(message, { variant: "error" });
        setPhase("review");
      },
    });
  };

  const stop = () => {
    providerRef.current?.stop();
    setInterim("");
    // Server transcription still has to upload + come back, so landing on an
    // empty review box here reads as "nothing happened". Wait visibly until
    // onEnd/onError moves us on.
    setPhase("transcribing");
  };

  // Never strand someone on the spinner if the provider goes quiet.
  useEffect(() => {
    if (phase !== "transcribing") return;
    const t = setTimeout(() => setPhase("review"), 25_000);
    return () => clearTimeout(t);
  }, [phase]);

  const extract = async () => {
    const transcript = finalText.trim();
    if (!transcript) return;
    setPhase("extracting");
    try {
      const res = await apiMutate<ExtractResponse>(
        `/api/w/${workspace.slug}/ai/extract`,
        { method: "POST", body: { transcript, source: "voice" } },
      );
      if ("queued" in res && res.queued) {
        toast("You're offline, hold that thought and try once you're back", {
          variant: "error",
        });
        setPhase("review");
        return;
      }
      setResult(res);
      setPhase("proposals");
    } catch (err) {
      if (err instanceof ApiError && err.code === "plan_limit") {
        // Surface the upgrade prompt but KEEP the sheet open so the transcript
        // the user just spoke isn't thrown away; they can copy it or upgrade.
        raiseLimit(err);
        setPhase("review");
        return;
      }
      toast(err instanceof Error ? err.message : "Extraction hit a snag", {
        variant: "error",
      });
      setPhase("review");
    }
  };

  const discard = () => {
    if (result) {
      void apiMutate(
        `/api/w/${workspace.slug}/captures/${result.captureId}/discard`,
        { method: "POST" },
      ).catch(() => undefined);
    }
    onClose();
  };

  return (
    <Dialog open onClose={onClose} ariaLabel="Voice capture" variant="sheet" className="sm:max-w-2xl">
      <DialogHeader
        title={
          phase === "proposals"
            ? "Confirm what I heard"
            : phase === "recording"
              ? "Listening…"
              : "Voice capture"
        }
        onClose={onClose}
      />

      {phase === "idle" && (
        <div className="px-5 pb-8 pt-2 text-center">
          <p className="mx-auto max-w-sm text-sm text-muted">
            Just finished a call? Talk through everything that needs doing, people, projects, days. You’ll review before anything is created.
          </p>
          <button
            onClick={() => {
              // Don't let someone record into a full quota and lose it after;
              // send them to the upgrade prompt instead.
              if (capturesLeft <= 0) {
                raiseLimit(
                  new ApiError(
                    "plan_limit",
                    "You've used your voice captures this month",
                    403,
                    "captures",
                  ),
                );
                onClose();
                return;
              }
              start();
            }}
            className="press mx-auto mt-6 flex size-20 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_10px_30px_-8px_rgba(0,0,0,0.55)] hover:bg-accent-hover disabled:opacity-50"
            aria-label="Start recording"
          >
            <Mic className="size-8" />
          </button>
          <p className="mt-3 text-xs text-faint">
            {capturesLeft > 0
              ? `Tap to start · ${capturesLeft} capture${capturesLeft === 1 ? "" : "s"} left this month`
              : "You've used this month's captures. Upgrade for more."}
          </p>
          <p className="mx-auto mt-4 max-w-xs text-[11px] leading-relaxed text-faint">
            Transcribed on your device. Audio is never recorded or stored, only the text you approve.
          </p>
        </div>
      )}

      {phase === "recording" && (
        <div className="px-5 pb-8 pt-2">
          <div className="min-h-28 rounded-card bg-raised p-4 text-[0.9375rem] leading-relaxed">
            {finalText}
            <span className="text-faint">{interim}</span>
            {!finalText && !interim && (
              <span className="text-faint">Speak naturally. I’m writing…</span>
            )}
          </div>
          <div className="mt-6 flex justify-center">
            <button
              onClick={stop}
              aria-label="Stop recording"
              className="press relative flex size-16 items-center justify-center rounded-full bg-danger text-white"
            >
              <span className="absolute inset-0 animate-ping rounded-full bg-danger/40" />
              <Square className="size-6 fill-current" />
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-faint">Tap to finish</p>
        </div>
      )}

      {phase === "transcribing" && (
        <div className="flex flex-col items-center gap-3 px-5 pb-10 pt-6">
          <Spinner />
          <p className="text-sm text-muted">Writing down what you said…</p>
          <p className="text-xs text-faint">This takes a moment on a slow line.</p>
        </div>
      )}

      {phase === "review" && (
        <div className="px-5 pb-5 pt-1">
          {supported && !finalText.trim() && (
            <p className="mb-3 rounded-control bg-warn/10 px-3 py-2 text-xs text-warn">
              I didn&apos;t catch anything that time. Tap the mic to try again,
              or type it below.
            </p>
          )}
          {!supported && (
            <p className="mb-3 rounded-control bg-raised px-3 py-2 text-xs text-muted">
              Live transcription isn’t available in this browser, type or
              paste what needs doing instead. Everything else works the same.
            </p>
          )}
          <textarea
            autoFocus={!supported}
            value={finalText}
            onChange={(e) => setFinalText(e.target.value)}
            rows={5}
            placeholder={
              "e.g. Naledi to send the Karoo Coffee report by Friday, then homepage concepts for Sable next week Tuesday…"
            }
            aria-label="Transcript"
            className="w-full resize-y rounded-card bg-raised p-4 text-[0.9375rem] leading-relaxed outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/30"
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            {supported ? (
              <Button variant="ghost" size="sm" onClick={() => start()}>
                <Mic className="size-4" />
                Add more
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => void extract()} disabled={!finalText.trim()}>
                Extract tasks
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === "extracting" && (
        <div className="flex flex-col items-center gap-3 px-5 pb-10 pt-4">
          <Spinner />
          <p className="text-sm text-muted">
            Turning ninety seconds of talking into a task list…
          </p>
        </div>
      )}

      {phase === "proposals" && result && (
        <div className={cn("flex max-h-[70dvh] flex-col")}>
          <ProposalReview
            captureId={result.captureId}
            proposals={result.proposals}
            engine={result.engine}
            defaultProjectId={defaultProjectId}
            onDone={onClose}
            onCancel={discard}
          />
        </div>
      )}
    </Dialog>
  );
}
