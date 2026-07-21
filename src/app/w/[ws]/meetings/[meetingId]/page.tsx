"use client";

/**
 * One meeting: summary, decisions, risks, the action-item review (the
 * extract → show → confirm moment), the speaker transcript, and playback.
 * Private meetings wear it loudly; sharing is one tap and linking a project
 * makes it team-visible by rule, never silently.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  Lock,
  Mail,
  Pencil,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { apiGet, apiMutate, ApiError } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import { timeAgo } from "@/lib/dates";
import { botStatusCopy, speakerLabel, speakersIn } from "@/lib/meetings";
import type { MeetingActionItem, MeetingDTO, MemberDTO } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

function fmtStamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MeetingPage() {
  const { workspace, members, projects, me } = useWorkspace();
  const params = useParams<{ meetingId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const meetingId = params.meetingId;
  const base = `/api/w/${workspace.slug}/meetings/${meetingId}`;

  const { data, isLoading, error } = useQuery({
    queryKey: ["ws", workspace.slug, "meeting", meetingId],
    queryFn: () => apiGet<{ meeting: MeetingDTO }>(base),
    refetchInterval: (q) => {
      const s = q.state.data?.meeting.status;
      return s === "processing" || s === "uploading" ? 4000 : false;
    },
    retry: (count, err) =>
      !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  const meeting = data?.meeting;
  const mine = meeting?.createdBy?.id === me.id;
  const [emailing, setEmailing] = useState(false);

  // A processing run should finish in ~a minute. If it's been much longer the
  // worker was probably killed; offer a retry (processMeeting is re-entrant).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const stuckTooLong =
    meeting?.status === "processing" &&
    now - new Date(meeting.createdAt).getTime() > 3 * 60_000;

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["ws", workspace.slug, "meeting", meetingId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["ws", workspace.slug, "meetings"],
    });
  };

  const patch = useMutation({
    mutationFn: (body: {
      title?: string;
      visibility?: "private" | "workspace";
      projectId?: string | null;
      speakerNames?: Record<string, string>;
    }) => apiMutate(base, { method: "PATCH", body }),
    onSuccess: refresh,
    onError: (e) =>
      toast(e instanceof ApiError ? e.message : "That didn't save", {
        variant: "error",
      }),
  });

  const reprocess = async () => {
    try {
      await fetch(`${base}/process`, { method: "POST" });
    } finally {
      refresh();
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center pt-24">
        <Spinner />
      </div>
    );
  }
  if (error || !meeting) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-16 text-center">
        <p className="font-medium">That meeting doesn't exist, or it isn't yours</p>
        <p className="mt-1 text-sm text-muted">
          Private meetings are only visible to whoever recorded them.
        </p>
        <Link
          href={`/w/${workspace.slug}/meetings`}
          className="mt-4 inline-block text-sm font-medium text-accent"
        >
          Back to meetings
        </Link>
      </div>
    );
  }

  const pending = meeting.actionItems.filter((i) => i.status === "pending");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-5 md:px-6 md:pt-7">
      <Link
        href={`/w/${workspace.slug}/meetings`}
        className="press inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-sm text-muted hover:bg-raised hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Meetings
      </Link>

      {/* ------------------------------ header ---------------------------- */}
      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <TitleEditor
            title={meeting.title}
            canEdit={mine}
            onSave={(title) => patch.mutate({ title })}
          />
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            {meeting.createdBy && (
              <span className="flex items-center gap-1.5">
                <Avatar
                  name={meeting.createdBy.name}
                  email={meeting.createdBy.email}
                  image={meeting.createdBy.image}
                  size={18}
                />
                {meeting.createdBy.name ?? meeting.createdBy.email}
              </span>
            )}
            <span>· {timeAgo(meeting.createdAt)}</span>
            {meeting.durationSec > 0 && (
              <span>· {Math.max(1, Math.round(meeting.durationSec / 60))} min</span>
            )}
          </p>
        </div>
        {mine && meeting.status === "ready" && (
          <Menu
            align="end"
            trigger={
              <Button variant="ghost" size="sm" aria-label="Meeting options">
                <ChevronDown className="size-4" />
              </Button>
            }
          >
            {(close) => (
              <>
                <MenuItem
                  onClick={() => {
                    close();
                    setEmailing(true);
                  }}
                >
                  <Mail className="size-4" />
                  Email the notes to teammates
                </MenuItem>
                {meeting.hasAudio && (
                  <MenuItem
                    onClick={async () => {
                      close();
                      await apiMutate(`${base}/audio`, { method: "DELETE" });
                      refresh();
                      toast("Audio deleted. The transcript stays", {
                        variant: "success",
                      });
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete the audio, keep the notes
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem
                  onClick={async () => {
                    close();
                    if (!window.confirm("Delete this meeting completely?")) return;
                    await apiMutate(base, { method: "DELETE" });
                    router.push(`/w/${workspace.slug}/meetings`);
                  }}
                >
                  <Trash2 className="size-4 text-danger" />
                  <span className="text-danger">Delete meeting</span>
                </MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>

      {/* --------------------------- visibility --------------------------- */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            meeting.visibility === "private"
              ? "bg-raised text-muted"
              : "bg-accent/10 text-accent",
          )}
        >
          {meeting.visibility === "private" ? (
            <Lock className="size-3" />
          ) : (
            <Users className="size-3" />
          )}
          {meeting.visibility === "private"
            ? "Only you can see this"
            : "Visible to the team"}
        </span>
        {mine && meeting.visibility === "private" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => patch.mutate({ visibility: "workspace" })}
          >
            Share with the team
          </Button>
        )}
        {mine && meeting.visibility === "workspace" && !meeting.projectId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch.mutate({ visibility: "private" })}
          >
            Make it private again
          </Button>
        )}
        {mine && (
          <select
            value={meeting.projectId ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              if (
                v &&
                meeting.visibility === "private" &&
                !window.confirm(
                  "Linking a project shares this meeting with the whole team. Continue?",
                )
              ) {
                return;
              }
              patch.mutate({ projectId: v });
            }}
            className="h-8 rounded-control border border-line bg-surface px-2 text-sm text-ink"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ----------------------------- status ----------------------------- */}
      {(meeting.status === "processing" || meeting.status === "uploading") && (
        <div className="mt-6 flex items-center gap-3 rounded-card bg-surface p-4">
          {meeting.source === "bot" && meeting.status === "uploading" ? (
            <Bot className="size-4 shrink-0 text-accent" />
          ) : (
            <Spinner className="size-4" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium">
              {meeting.status === "processing"
                ? "Transcribing and summarizing…"
                : meeting.source === "bot"
                  ? botStatusCopy(meeting.botStatus)
                  : "Waiting for the audio upload…"}
            </p>
            <p className="text-xs text-muted">
              {meeting.source === "bot" && meeting.status === "uploading"
                ? "The notes arrive on their own after the call ends. The page updates itself."
                : "This usually takes about a minute. The page updates itself."}
            </p>
          </div>
          {/* Device recording awaiting its first transcribe, OR a run that got
              stuck (deploy/timeout) more than ~3 min ago: always give the
              creator a way to kick it. */}
          {mine &&
            meeting.source === "device" &&
            (meeting.status === "uploading" || stuckTooLong) && (
              <Button size="sm" variant="outline" onClick={reprocess}>
                <RefreshCw className="size-4" />
                {meeting.status === "uploading" ? "Transcribe now" : "Try again"}
              </Button>
            )}
        </div>
      )}
      {meeting.status === "failed" && (
        <div className="mt-6 rounded-card bg-danger/5 p-4">
          <p className="text-sm font-medium text-danger">
            {meeting.error ?? "Processing failed"}
          </p>
          {mine && (meeting.source === "device" || meeting.hasAudio) && (
            <Button className="mt-3" size="sm" variant="outline" onClick={reprocess}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
          )}
        </div>
      )}

      {/* ----------------------------- summary ----------------------------- */}
      {meeting.summary && (
        <div className="mt-6 rounded-card bg-surface p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" />
            <h2 className="font-semibold">Summary</h2>
          </div>
          <p className="mt-2 text-[0.9375rem] leading-relaxed">
            {meeting.summary.tldr}
          </p>
          {meeting.summary.decisions.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
                Decisions
              </h3>
              <ul className="mt-1.5 space-y-1">
                {meeting.summary.decisions.map((d, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {meeting.summary.risks.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
                Watch out for
              </h3>
              <ul className="mt-1.5 space-y-1">
                {meeting.summary.risks.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger/70" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {meeting.status === "ready" && !meeting.summary && (
        <div className="mt-6 rounded-card bg-surface p-4 text-sm text-muted">
          The transcript is ready. AI summaries aren't switched on for this
          server yet, so there's no auto-summary this time.
        </div>
      )}

      {/* -------------------------- action items --------------------------- */}
      {meeting.actionItems.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold">
            Action items{" "}
            {pending.length > 0 && (
              <span className="ml-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {pending.length} to review
              </span>
            )}
          </h2>
          {mine && pending.length > 0 && (
            <p className="mt-0.5 text-sm text-muted">
              Nothing becomes a task until you say so.
            </p>
          )}
          <div className="mt-3 space-y-2">
            {meeting.actionItems.map((item, index) => (
              <ActionItemCard
                key={index}
                item={item}
                index={index}
                canAct={mine}
                meetingProjectId={meeting.projectId}
                onDone={refresh}
              />
            ))}
          </div>
        </div>
      )}

      {/* --------------------------- transcript ---------------------------- */}
      {meeting.transcript && meeting.transcript.text && (
        <Transcript
          transcript={meeting.transcript}
          speakerNames={meeting.speakerNames}
          canRename={mine}
          onRename={(speaker, name) =>
            patch.mutate({ speakerNames: { [String(speaker)]: name } })
          }
        />
      )}

      {/* ----------------------------- audio ------------------------------- */}
      {meeting.hasAudio && meeting.status === "ready" && (
        <AudioPlayer url={`${base}/audio`} />
      )}

      {emailing && (
        <EmailNotesDialog
          base={base}
          meIdToSkip={me.id}
          onClose={() => setEmailing(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------ pieces ----------------------------------- */

function TitleEditor({
  title,
  canEdit,
  onSave,
}: {
  title: string;
  canEdit: boolean;
  onSave: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);

  if (!canEdit || !editing) {
    return (
      <h1
        className={cn(
          "text-xl font-semibold tracking-tight",
          canEdit && "cursor-text rounded px-1 -mx-1 hover:bg-raised",
        )}
        onClick={canEdit ? () => setEditing(true) : undefined}
      >
        {title}
      </h1>
    );
  }
  const commit = () => {
    setEditing(false);
    const t = value.trim();
    if (t && t !== title) onSave(t);
    else setValue(title);
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setValue(title);
          setEditing(false);
        }
      }}
      maxLength={200}
      autoFocus
      className="-mx-1 w-full rounded bg-raised px-1 text-xl font-semibold tracking-tight outline-none"
    />
  );
}

function ActionItemCard({
  item,
  index,
  canAct,
  meetingProjectId,
  onDone,
}: {
  item: MeetingActionItem;
  index: number;
  canAct: boolean;
  meetingProjectId: string | null;
  onDone: () => void;
}) {
  const { workspace, members, projects } = useWorkspace();
  const params = useParams<{ meetingId: string }>();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | null>(
    item.assigneeId ?? null,
  );
  const [dueDate, setDueDate] = useState<string>(item.dueDate ?? "");
  const [projectId, setProjectId] = useState<string>(
    item.projectId ?? meetingProjectId ?? "",
  );

  const resolve = async (action: "accept" | "dismiss") => {
    if (action === "accept" && !projectId) {
      toast("Pick a project for this task first", { variant: "error" });
      return;
    }
    setBusy(true);
    try {
      await apiMutate(
        `/api/w/${workspace.slug}/meetings/${params.meetingId}/items`,
        {
          method: "POST",
          body: {
            index,
            action,
            ...(action === "accept"
              ? {
                  edits: {
                    projectId,
                    assigneeId: assigneeId,
                    dueDate: dueDate || null,
                  },
                }
              : {}),
          },
        },
      );
      if (action === "accept") toast("Task created", { variant: "success" });
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "That didn't work", {
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  if (item.status !== "pending") {
    return (
      <div className="flex items-center gap-2.5 rounded-card bg-surface/60 p-3.5 text-muted">
        {item.status === "accepted" ? (
          <Check className="size-4 shrink-0 text-accent" />
        ) : (
          <X className="size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm line-through decoration-line/60">
          {item.title}
        </span>
        <span className="shrink-0 text-xs">
          {item.status === "accepted" ? "Task created" : "Dismissed"}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-card bg-surface p-4">
      <p className="font-medium leading-snug">{item.title}</p>
      {item.note && <p className="mt-1 text-sm text-muted">{item.note}</p>}
      {item.assigneeName && !item.assigneeId && (
        <p className="mt-1 text-xs text-faint">
          Heard in the meeting: for {item.assigneeName}
        </p>
      )}
      {canAct ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-8 rounded-control border border-line bg-surface px-2 text-sm"
            >
              <option value="">Project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={assigneeId ?? ""}
              onChange={(e) => setAssigneeId(e.target.value || null)}
              className="h-8 rounded-control border border-line bg-surface px-2 text-sm"
            >
              <option value="">Nobody yet</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-8 rounded-control border border-line bg-surface px-2 text-sm"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" loading={busy} onClick={() => resolve("accept")}>
              <Check className="size-4" />
              Make it a task
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => resolve("dismiss")}
            >
              Dismiss
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-faint">
          Waiting for the recorder to review this one.
        </p>
      )}
    </div>
  );
}

function Transcript({
  transcript,
  speakerNames,
  canRename,
  onRename,
}: {
  transcript: { text: string; utterances: { speaker: number; start: number; end: number; text: string }[] };
  speakerNames: Record<string, string> | null | undefined;
  canRename: boolean;
  onRename: (speaker: number, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const speakers = speakersIn(transcript.utterances);

  const commit = () => {
    if (editing !== null && draft.trim()) onRename(editing, draft.trim());
    setEditing(null);
  };

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(!open)}
        className="press flex w-full items-center gap-2 rounded-control px-1 py-1 text-left font-semibold hover:bg-raised"
      >
        <ChevronDown
          className={cn("size-4 text-faint transition-transform", !open && "-rotate-90")}
        />
        Transcript
      </button>
      {open && (
        <div className="mt-2 rounded-card bg-surface p-4">
          {/* Put names to the voices; the whole page reads better after. */}
          {canRename && speakers.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-line pb-3">
              {speakers.map((s) =>
                editing === s ? (
                  <input
                    key={s}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    maxLength={60}
                    autoFocus
                    placeholder={`Speaker ${s + 1}`}
                    className="h-7 w-32 rounded-full border border-accent bg-surface px-2.5 text-xs outline-none"
                  />
                ) : (
                  <button
                    key={s}
                    onClick={() => {
                      setEditing(s);
                      setDraft(speakerNames?.[String(s)] ?? "");
                    }}
                    className="press flex items-center gap-1 rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-muted hover:text-ink"
                    title="Rename this speaker"
                  >
                    {speakerLabel(s, speakerNames)}
                    <Pencil className="size-3" />
                  </button>
                ),
              )}
            </div>
          )}
          <div className="max-h-[28rem] space-y-3 overflow-y-auto">
            {transcript.utterances.length > 0 ? (
              transcript.utterances.map((u, i) => (
                <div key={i} className="flex gap-3">
                  <span className="w-14 shrink-0 pt-0.5 text-xs tabular text-faint">
                    {fmtStamp(u.start)}
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-accent">
                      {speakerLabel(u.speaker, speakerNames)}
                    </span>
                    <p className="text-sm leading-relaxed">{u.text}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {transcript.text}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmailNotesDialog({
  base,
  meIdToSkip,
  onClose,
}: {
  base: string;
  meIdToSkip: string;
  onClose: () => void;
}) {
  const { members } = useWorkspace();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const candidates: MemberDTO[] = members.filter((m) => m.id !== meIdToSkip);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    setBusy(true);
    try {
      const res = await apiMutate<{ sent: number }>(`${base}/email`, {
        method: "POST",
        body: { memberIds: [...selected] },
      });
      if ("sent" in res) {
        toast(
          res.sent === 1 ? "Notes sent to 1 person" : `Notes sent to ${res.sent} people`,
          { variant: "success" },
        );
      }
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Sending failed", {
        variant: "error",
      });
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} ariaLabel="Email the notes" variant="center">
      <DialogHeader title="Email the notes" onClose={onClose} />
      <div className="px-5 pb-5">
        {candidates.length === 0 ? (
          <p className="text-sm text-muted">
            You're the only person in this workspace so far. Invite your team
            first, then send them notes.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              The summary, decisions and action items go out by email. The
              recording and transcript stay here.
            </p>
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
              {candidates.map((m) => (
                <label
                  key={m.id}
                  className="press flex cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 hover:bg-raised"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  <Avatar name={m.name} email={m.email} image={m.image} size={22} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {m.name ?? m.email}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {candidates.length > 0 && (
            <Button onClick={send} loading={busy} disabled={selected.size === 0}>
              <Mail className="size-4" />
              Send
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function AudioPlayer({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const { url: signed } = await apiGet<{ url: string }>(url);
      setSrc(signed);
    } catch {
      toast("Couldn't load the audio", { variant: "error" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (src) ref.current?.play().catch(() => undefined);
  }, [src]);

  return (
    <div className="mt-6">
      {src ? (
        <audio ref={ref} controls src={src} className="w-full" />
      ) : (
        <Button variant="outline" size="sm" loading={loading} onClick={load}>
          <Play className="size-4" />
          Play the recording
        </Button>
      )}
    </div>
  );
}
