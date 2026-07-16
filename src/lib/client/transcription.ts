"use client";

/**
 * TranscriptionProvider — the seam between capture UX and the engine doing
 * the listening. Phase 1 ships the on-device Web Speech API (covers the
 * Android-Chrome majority; audio never leaves the phone and is never
 * stored). Swapping in a server-side provider later (Whisper/Deepgram over
 * chunked upload) means implementing this interface and changing the
 * factory below — the capture UI doesn't change.
 */

export interface TranscriptionCallbacks {
  /** Rolling transcript: `final` is committed text, `interim` is live guess. */
  onResult: (final: string, interim: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface TranscriptionProvider {
  readonly kind: string;
  start(cb: TranscriptionCallbacks): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

function speechCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function transcriptionSupported(): boolean {
  return speechCtor() !== null;
}

class WebSpeechProvider implements TranscriptionProvider {
  readonly kind = "web-speech";
  private rec: SpeechRecognitionLike | null = null;
  private finalText = "";
  private stopping = false;

  start(cb: TranscriptionCallbacks): void {
    const Ctor = speechCtor();
    if (!Ctor) {
      cb.onError("Speech recognition isn't available in this browser");
      return;
    }
    this.finalText = "";
    this.stopping = false;
    const rec = new Ctor();
    rec.lang = "en-ZA";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      cb.onResult(this.finalText, interim);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      cb.onError(
        e.error === "not-allowed"
          ? "Microphone access was blocked — allow it in your browser settings"
          : "The microphone hit a snag — try again",
      );
    };
    rec.onend = () => {
      // Chrome ends sessions on silence; restart until the user stops.
      if (!this.stopping && this.rec === rec) {
        try {
          rec.start();
          return;
        } catch {
          // fall through to onEnd
        }
      }
      cb.onEnd();
    };
    this.rec = rec;
    rec.start();
  }

  stop(): void {
    this.stopping = true;
    this.rec?.stop();
    this.rec = null;
  }
}

export function createTranscriptionProvider(): TranscriptionProvider {
  return new WebSpeechProvider();
}
