"use client";

/**
 * The meeting recorder. Three ways in: the phone/laptop mic for a room,
 * mic + tab audio mixed for an online call (desktop Chrome/Edge), or a file
 * someone recorded elsewhere. Opus at 32 kbps keeps an hour near 14 MB, so
 * cheap-data uploads stay survivable.
 *
 * Consent is a first-class UI element, not fine print: POPIA/RICA expects
 * the room to know it's being recorded.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Mic,
  MonitorSpeaker,
  Square,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import { MEETING_MAX_BYTES, MEETING_MAX_SECONDS } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type Mode = "idle" | "recording" | "uploading";

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "audio/webm";
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MeetingRecorderDialog({
  remainingMinutes,
  onClose,
}: {
  remainingMinutes: number;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [source, setSource] = useState<"mic" | "call" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  /** One for the level meter, plus the call-mode mixer when present. */
  const audioCtxRef = useRef<AudioContext[]>([]);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number>(0);
  const startedAtRef = useRef(0);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    recorderRef.current = null;
    for (const s of streamsRef.current) s.getTracks().forEach((t) => t.stop());
    streamsRef.current = [];
    for (const ac of audioCtxRef.current) ac.close().catch(() => undefined);
    audioCtxRef.current = [];
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  };
  // Unmount safety net: never leave the mic running.
  useEffect(() => cleanup, []);

  const meter = (stream: MediaStream) => {
    const ac = new AudioContext();
    audioCtxRef.current.push(ac);
    const src = ac.createMediaStreamSource(stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.min(1, peak / 64));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const beginRecording = (stream: MediaStream, from: "mic" | "call") => {
    const mime = pickMime();
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      audioBitsPerSecond: 32_000,
    });
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.start(1000);
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    setSource(from);
    setMode("recording");
    setElapsed(0);
    meter(stream);
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(sec);
      if (sec >= MEETING_MAX_SECONDS) stopAndUpload();
    }, 1000);
    (
      navigator as Navigator & {
        wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
      }
    ).wakeLock
      ?.request("screen")
      .then((l) => (wakeLockRef.current = l))
      .catch(() => undefined);
  };

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamsRef.current = [stream];
      beginRecording(stream, "mic");
    } catch {
      toast("Microphone access was blocked. Allow it in your browser and retry", {
        variant: "error",
      });
    }
  };

  /**
   * Online call: capture the call tab's audio (the other people) AND the mic
   * (you), mixed into one stream. Tab audio only carries the remote side, so
   * without the mic your own voice would vanish from the recording.
   */
  const startCall = async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      if (display.getAudioTracks().length === 0) {
        display.getTracks().forEach((t) => t.stop());
        toast("Pick the call's tab and tick 'Also share tab audio'", {
          variant: "error",
        });
        return;
      }
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      // We only need the sound; drop the video track right away.
      display.getVideoTracks().forEach((t) => t.stop());

      const ac = new AudioContext();
      const dest = ac.createMediaStreamDestination();
      ac.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(dest);
      ac.createMediaStreamSource(mic).connect(dest);
      audioCtxRef.current.push(ac);
      streamsRef.current = [display, mic];

      // If they stop sharing from the browser chrome, wrap up gracefully.
      display.getAudioTracks()[0].addEventListener("ended", () => stopAndUpload());
      beginRecording(dest.stream, "call");
    } catch {
      toast("Couldn't start the call capture. Use Chrome or Edge on a computer", {
        variant: "error",
      });
    }
  };

  const upload = async (blob: Blob, mime: string, durationSec: number) => {
    setMode("uploading");
    try {
      if (blob.size > MEETING_MAX_BYTES) {
        throw new ApiError("too_big", "That recording is over the 150 MB cap", 400);
      }
      const begin = await fetch(`/api/w/${workspace.slug}/meetings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Meeting",
          mime,
          sizeBytes: blob.size,
          durationSec: Math.max(1, durationSec),
        }),
      });
      if (!begin.ok) {
        const body = (await begin.json().catch(() => null)) as {
          error?: { message?: string; limit?: string };
        } | null;
        if (body?.error?.limit) {
          window.dispatchEvent(
            new CustomEvent("aw:limit", {
              detail: { limit: body.error.limit, message: body.error.message },
            }),
          );
        }
        throw new ApiError("begin", body?.error?.message ?? "Couldn't start the upload", begin.status);
      }
      const { meetingId, uploadUrl } = (await begin.json()) as {
        meetingId: string;
        uploadUrl: string;
      };

      const put = await fetch(uploadUrl, { method: "PUT", body: blob });
      if (!put.ok) throw new ApiError("upload", "The upload didn't make it", put.status);

      // Kick off transcription and go; the detail page polls the progress.
      void fetch(`/api/w/${workspace.slug}/meetings/${meetingId}/process`, {
        method: "POST",
      }).catch(() => undefined);

      router.push(`/w/${workspace.slug}/meetings/${meetingId}`);
      onClose();
    } catch (err) {
      setMode("idle");
      setSource(null);
      toast(err instanceof ApiError ? err.message : "Upload failed. Try again", {
        variant: "error",
      });
    }
  };

  const stopAndUpload = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    const durationSec = Math.max(
      1,
      Math.floor((Date.now() - startedAtRef.current) / 1000),
    );
    rec.onstop = () => {
      const mime = (rec.mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(chunksRef.current, { type: mime });
      cleanup();
      void upload(blob, mime, durationSec);
    };
    rec.stop();
  };

  const onFile = (file: File) => {
    if (file.size > MEETING_MAX_BYTES) {
      toast("That file is over the 150 MB cap", { variant: "error" });
      return;
    }
    // Duration is unknown until Deepgram measures it; estimate from size at
    // a spoken-audio bitrate so the quota gate has something honest to hold.
    const estimated = Math.min(
      MEETING_MAX_SECONDS,
      Math.max(60, Math.round(file.size / 8_000)),
    );
    void upload(file, file.type || "audio/mpeg", estimated);
  };

  const noMinutes = remainingMinutes <= 0;

  return (
    <Dialog
      open
      onClose={() => {
        if (mode === "recording") return; // stop first, deliberately
        cleanup();
        onClose();
      }}
      ariaLabel="Record a meeting"
      variant="center"
    >
      <DialogHeader
        title={mode === "recording" ? "Recording…" : "Record a meeting"}
        onClose={() => {
          if (mode === "recording") {
            toast("Stop the recording first");
            return;
          }
          cleanup();
          onClose();
        }}
      />
      <div className="px-5 pb-5">
        {mode === "idle" && (
          <>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's this meeting about?"
              maxLength={200}
              autoFocus
            />
            <p className="mt-3 rounded-control bg-raised px-3 py-2 text-xs text-muted">
              Tell everyone they're being recorded before you start. It's the
              law (POPIA), and it's good manners.
            </p>
            {noMinutes ? (
              <p className="mt-3 text-sm text-danger">
                Your workspace has used all its meeting minutes this month.
              </p>
            ) : (
              <p className="mt-3 text-xs text-faint">
                {remainingMinutes} transcription minutes left this month · caps
                at 2 hours per meeting
              </p>
            )}
            <div className="mt-4 grid gap-2">
              <Button onClick={startMic} disabled={noMinutes}>
                <Mic className="size-4" />
                Record the room
              </Button>
              <Button
                variant="outline"
                onClick={startCall}
                disabled={noMinutes}
                className="hidden md:inline-flex"
              >
                <MonitorSpeaker className="size-4" />
                Record an online call (this computer)
              </Button>
              <label
                className={cn(
                  "press inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-control text-muted hover:bg-raised hover:text-ink",
                  noMinutes && "pointer-events-none opacity-50",
                )}
              >
                <Upload className="size-4" />
                <span className="text-sm">Upload a recording</span>
                <input
                  type="file"
                  accept="audio/*,video/webm,video/mp4"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                  }}
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-faint">
              Only you will see this meeting until you share it or link it to a
              project.
            </p>
          </>
        )}

        {mode === "recording" && (
          <div className="flex flex-col items-center py-4">
            <div className="relative">
              <span
                className="absolute inset-0 rounded-full bg-danger/25"
                style={{ transform: `scale(${1 + level * 0.5})` }}
              />
              <span className="relative grid size-16 place-items-center rounded-full bg-danger/15">
                <span className="size-3 animate-pulse rounded-full bg-danger" />
              </span>
            </div>
            <p className="mt-4 text-2xl font-semibold tabular tracking-tight">
              {fmtClock(elapsed)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {source === "call" ? "Recording your mic + the call's tab" : "Recording the room"}
            </p>
            <p className="mt-0.5 text-xs text-faint">
              Keep this tab open. Stops itself at 2 hours.
            </p>
            <Button className="mt-5" variant="danger" onClick={stopAndUpload}>
              <Square className="size-4" />
              Stop and transcribe
            </Button>
          </div>
        )}

        {mode === "uploading" && (
          <div className="flex flex-col items-center py-8">
            <AudioLines className="size-8 animate-pulse text-accent" />
            <p className="mt-3 font-medium">Uploading the audio…</p>
            <p className="mt-1 text-sm text-muted">
              Keep this open until it finishes.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
