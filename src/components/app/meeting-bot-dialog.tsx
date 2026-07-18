"use client";

/**
 * Send the notetaker bot into a Zoom/Meet/Teams call (M3, paid add-on).
 * The bot joins as a visible participant called "Alpha Workspace notetaker",
 * so the room can see the recording happening, consent made visible.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { ApiError, apiMutate } from "@/lib/client/api";
import { useFeature, useWorkspace } from "@/lib/client/workspace";
import type { MeetingDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function MeetingBotDialog({ onClose }: { onClose: () => void }) {
  const { workspace, projects } = useWorkspace();
  const enabled = useFeature("meeting_bots");
  const router = useRouter();
  const { toast } = useToast();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const res = await apiMutate<{ meeting: MeetingDTO }>(
        `/api/w/${workspace.slug}/meetings/bot`,
        {
          method: "POST",
          body: {
            meetingUrl: url.trim(),
            title: title.trim() || "Meeting",
            projectId: projectId || null,
          },
        },
      );
      if ("meeting" in res) {
        toast("Bot is on its way. Let it in if the host has a lobby", {
          variant: "success",
        });
        router.push(`/w/${workspace.slug}/meetings/${res.meeting.id}`);
        onClose();
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That didn't work", {
        variant: "error",
      });
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} ariaLabel="Send a notetaker bot" variant="center">
      <DialogHeader title="Send a notetaker bot" onClose={onClose} />
      <div className="px-5 pb-5">
        {enabled ? (
          <>
            <p className="text-sm text-muted">
              Paste the call link and a bot named{" "}
              <span className="font-medium text-ink">
                Alpha Workspace notetaker
              </span>{" "}
              joins, records, and writes the notes. Everyone sees it in the
              participant list, tell them what it's for.
            </p>
            <div className="mt-4 space-y-2.5">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://meet.google.com/… or Zoom / Teams link"
                autoFocus
              />
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's this meeting about?"
                maxLength={200}
              />
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="h-10 w-full rounded-control border border-line bg-surface px-3 text-[0.9375rem]"
              >
                <option value="">No project (stays private to you)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (shared with the team)
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={send} loading={busy} disabled={!url.trim()}>
                <Bot className="size-4" />
                Send the bot
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              Bots that join Zoom, Google Meet and Microsoft Teams calls are an
              add-on (they carry a real per-minute cost). If your team wants
              them, get in touch and we'll switch them on for your workspace.
            </p>
            <div className="mt-4 flex justify-end">
              <Button variant="quiet" onClick={onClose}>
                Got it
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
