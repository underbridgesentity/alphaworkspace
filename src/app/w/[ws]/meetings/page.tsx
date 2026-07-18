"use client";

/**
 * Meetings index. Record, see what's yours (private by default) and what the
 * team shared, and keep an eye on the month's transcription minutes.
 */
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AudioLines, Lock, Mic, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { apiGet } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import { timeAgo } from "@/lib/dates";
import type { MeetingDTO } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MeetingRecorderDialog } from "@/components/app/meeting-recorder";

interface MeetingsData {
  meetings: MeetingDTO[];
  usage: { usedMinutes: number; limitMinutes: number };
}

function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const STATUS_COPY: Record<MeetingDTO["status"], string> = {
  uploading: "Waiting for audio",
  processing: "Transcribing…",
  ready: "",
  failed: "Failed",
};

export default function MeetingsPage() {
  const { workspace } = useWorkspace();
  const [recording, setRecording] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ws", workspace.slug, "meetings"],
    queryFn: () => apiGet<MeetingsData>(`/api/w/${workspace.slug}/meetings`),
    refetchInterval: (q) =>
      q.state.data?.meetings.some(
        (m) => m.status === "processing" || m.status === "uploading",
      )
        ? 5000
        : false,
  });

  const usage = data?.usage;
  const remaining = usage
    ? Math.max(0, usage.limitMinutes - usage.usedMinutes)
    : 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-5 md:px-6 md:pt-7">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Meetings</h1>
          <p className="mt-0.5 text-sm text-muted">
            Record it once. The summary, the decisions and the tasks write
            themselves.
          </p>
        </div>
        <Button onClick={() => setRecording(true)}>
          <Mic className="size-4" />
          Record
        </Button>
      </div>

      {usage && (
        <div className="mt-4 rounded-card bg-surface p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">
              {usage.usedMinutes} of {usage.limitMinutes} minutes used this
              month
            </p>
            <p className="text-xs text-faint">{remaining} left</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
            <div
              className={cn(
                "h-full rounded-full",
                remaining === 0 ? "bg-danger" : "bg-accent",
              )}
              style={{
                width: `${Math.min(100, (usage.usedMinutes / Math.max(1, usage.limitMinutes)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="mt-16 flex justify-center">
          <Spinner />
        </div>
      ) : (data?.meetings.length ?? 0) === 0 ? (
        <div className="mt-16 text-center animate-fade-up">
          <AudioLines className="mx-auto size-9 text-faint" />
          <p className="mt-3 font-medium">No meetings yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Record the room from your phone or capture an online call from your
            computer. Meetings stay private to you until you share them.
          </p>
          <Button className="mt-4" onClick={() => setRecording(true)}>
            <Mic className="size-4" />
            Record your first meeting
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {data!.meetings.map((m) => (
            <Link
              key={m.id}
              href={`/w/${workspace.slug}/meetings/${m.id}`}
              className="press block rounded-card bg-surface p-4 hover:bg-raised"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {m.title}
                </span>
                {m.status !== "ready" && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      m.status === "failed"
                        ? "bg-danger/10 text-danger"
                        : "bg-raised text-muted",
                    )}
                  >
                    {STATUS_COPY[m.status]}
                  </span>
                )}
                <span
                  className="flex shrink-0 items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-muted"
                  title={
                    m.visibility === "private"
                      ? "Only you can see this"
                      : "Visible to the whole workspace"
                  }
                >
                  {m.visibility === "private" ? (
                    <Lock className="size-3" />
                  ) : (
                    <Users className="size-3" />
                  )}
                  {m.visibility === "private" ? "Just you" : "Team"}
                </span>
              </div>
              <p className="mt-1.5 flex items-center gap-2 text-sm text-muted">
                {m.createdBy && (
                  <Avatar
                    name={m.createdBy.name}
                    email={m.createdBy.email}
                    image={m.createdBy.image}
                    size={18}
                  />
                )}
                <span>{fmtDuration(m.durationSec)}</span>
                {m.status === "ready" && m.actionItems.length > 0 && (
                  <span>
                    ·{" "}
                    {m.actionItems.filter((i) => i.status === "pending").length}{" "}
                    of {m.actionItems.length} actions to review
                  </span>
                )}
                <span className="flex-1" />
                <span className="text-xs text-faint">{timeAgo(m.createdAt)}</span>
              </p>
            </Link>
          ))}
        </div>
      )}

      {recording && (
        <MeetingRecorderDialog
          remainingMinutes={remaining}
          onClose={() => setRecording(false)}
        />
      )}
    </div>
  );
}
