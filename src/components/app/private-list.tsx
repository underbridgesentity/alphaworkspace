"use client";

/**
 * The private list on My Work: personal to-dos only their owner ever sees
 * (the server never returns anyone else's, admins included). Promoting an
 * item is the one door out, it becomes an ordinary team task in a project.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Lock, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiError, apiGet, apiMutate } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import type { PrivateTaskDTO, TaskDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ChecklistChip, DueChip } from "./status-bits";
import { RichText } from "./rich-text";

export function PrivateList() {
  const { workspace, projects } = useWorkspace();
  const qc = useQueryClient();
  const { toast } = useToast();
  const base = `/api/w/${workspace.slug}/private-tasks`;
  const key = ["ws", workspace.slug, "private-tasks"];

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => apiGet<{ tasks: PrivateTaskDTO[] }>(base),
    select: (d) => d.tasks,
  });
  const open = (data ?? []).filter((t) => !t.completedAt);
  const done = (data ?? []).filter((t) => t.completedAt);

  const [title, setTitle] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<PrivateTaskDTO | null>(null);

  const setCache = (fn: (tasks: PrivateTaskDTO[]) => PrivateTaskDTO[]) =>
    qc.setQueryData<{ tasks: PrivateTaskDTO[] }>(key, (prev) =>
      prev ? { tasks: fn(prev.tasks) } : prev,
    );
  const refresh = () => void qc.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: (t: string) => {
      const id = crypto.randomUUID();
      setCache((tasks) => [
        {
          id,
          title: t,
          note: "",
          dueDate: null,
          completedAt: null,
          createdAt: new Date().toISOString(),
        },
        ...tasks,
      ]);
      return apiMutate(base, { method: "POST", body: { id, title: t } });
    },
    onSuccess: refresh,
    onError: (e) => {
      refresh();
      toast(e instanceof ApiError ? e.message : "That didn't save", {
        variant: "error",
      });
    },
  });

  const toggle = (t: PrivateTaskDTO) => {
    const doneNow = !t.completedAt;
    setCache((tasks) =>
      tasks.map((x) =>
        x.id === t.id
          ? { ...x, completedAt: doneNow ? new Date().toISOString() : null }
          : x,
      ),
    );
    void apiMutate(`${base}/${t.id}`, {
      method: "PATCH",
      body: { done: doneNow },
    })
      .then(refresh)
      .catch(refresh);
  };

  return (
    <section className="mt-8" aria-label="Private tasks">
      <div className="flex items-center gap-1.5 px-3">
        <Lock className="size-3.5 text-faint" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
          Private
        </h2>
        <span className="text-[11px] text-faint">· only you see these</span>
      </div>

      <div className="mt-2 rounded-card bg-surface p-2">
        <form
          className="flex items-center gap-2 px-1"
          onSubmit={(e) => {
            e.preventDefault();
            const t = title.trim();
            if (!t) return;
            setTitle("");
            add.mutate(t);
          }}
        >
          <Plus className="size-4 shrink-0 text-faint" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a private task…"
            maxLength={500}
            aria-label="Add a private task"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </form>

        {open.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {open.map((t) => (
              <Row key={t.id} task={t} onToggle={toggle} onOpen={setEditing} />
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div className="mt-1 border-t border-line/60 pt-1">
            <button
              onClick={() => setShowDone(!showDone)}
              className="press flex items-center gap-1 rounded-control px-2 py-1 text-xs text-faint hover:text-muted"
            >
              <ChevronDown
                className={cn("size-3.5 transition-transform", !showDone && "-rotate-90")}
              />
              Done <span className="tabular">{done.length}</span>
            </button>
            {showDone &&
              done.map((t) => (
                <Row key={t.id} task={t} onToggle={toggle} onOpen={setEditing} />
              ))}
          </div>
        )}
      </div>

      {editing && (
        <PrivateTaskDialog
          task={editing}
          projects={projects}
          base={base}
          onClose={() => setEditing(null)}
          onChanged={(next) => {
            if (next) setCache((tasks) => tasks.map((x) => (x.id === next.id ? next : x)));
            else setCache((tasks) => tasks.filter((x) => x.id !== editing.id));
            refresh();
          }}
        />
      )}
    </section>
  );
}

function Row({
  task,
  onToggle,
  onOpen,
}: {
  task: PrivateTaskDTO;
  onToggle: (t: PrivateTaskDTO) => void;
  onOpen: (t: PrivateTaskDTO) => void;
}) {
  const isDone = Boolean(task.completedAt);
  return (
    <div className="group flex items-center gap-2.5 rounded-control px-2 py-1.5 hover:bg-raised">
      <button
        onClick={() => onToggle(task)}
        aria-label={isDone ? "Reopen" : "Mark done"}
        className={cn(
          "press grid size-[18px] shrink-0 place-items-center rounded-full border",
          isDone
            ? "border-accent bg-accent text-on-accent"
            : "border-line-strong hover:border-accent",
        )}
      >
        {isDone && (
          <svg viewBox="0 0 10 8" className="size-2" fill="none" aria-hidden>
            <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <button
        onClick={() => onOpen(task)}
        className={cn(
          "min-w-0 flex-1 truncate text-left text-sm",
          isDone && "text-faint line-through decoration-line",
        )}
      >
        {task.title}
      </button>
      <ChecklistChip description={task.note} />
      <DueChip dueDate={task.dueDate} done={isDone} />
    </div>
  );
}

/** Note field that renders `- [ ]` checklists with tickable boxes when idle. */
function NoteField({
  note,
  onChange,
}: {
  note: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(note.trim().length === 0);

  const toggle = (lineIndex: number, checked: boolean) => {
    const lines = note.split("\n");
    lines[lineIndex] = lines[lineIndex].replace(
      /- \[( |x|X)\]/,
      `- [${checked ? "x" : " "}]`,
    );
    onChange(lines.join("\n"));
  };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="mt-2 min-h-[3rem] cursor-text rounded-control border border-line bg-surface px-3 py-2.5 text-[0.9375rem] leading-relaxed"
      >
        <RichText text={note} onToggleCheck={toggle} />
      </div>
    );
  }

  return (
    <textarea
      value={note}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(note.trim().length === 0)}
      placeholder="A note, only for you. Try a - [ ] checklist for steps."
      maxLength={5000}
      rows={3}
      aria-label="Note"
      className="mt-2 w-full resize-none rounded-control border border-line bg-surface px-3 py-2.5 text-base leading-relaxed outline-none placeholder:text-faint focus:border-accent"
    />
  );
}

function PrivateTaskDialog({
  task,
  projects,
  base,
  onClose,
  onChanged,
}: {
  task: PrivateTaskDTO;
  projects: { id: string; name: string }[];
  base: string;
  onClose: () => void;
  onChanged: (next: PrivateTaskDTO | null) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | "promote" | null>(null);

  const save = async () => {
    setBusy("save");
    try {
      const res = await apiMutate<{ task: PrivateTaskDTO }>(`${base}/${task.id}`, {
        method: "PATCH",
        body: { title: title.trim() || task.title, note, dueDate: dueDate || null },
      });
      onChanged("task" in res ? res.task : null);
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "That didn't save", { variant: "error" });
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await apiMutate(`${base}/${task.id}`, { method: "DELETE" });
      onChanged(null);
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Delete failed", { variant: "error" });
      setBusy(null);
    }
  };

  const promote = async () => {
    if (!projectId) return;
    setBusy("promote");
    try {
      const res = await apiMutate<{ task: TaskDTO }>(
        `${base}/${task.id}/promote`,
        { method: "POST", body: { projectId, dueDate: dueDate || null } },
      );
      onChanged(null);
      onClose();
      if ("task" in res) {
        toast("It's a team task now, assigned to you", { variant: "success" });
        void qc.invalidateQueries({ queryKey: ["ws", workspace.slug, "my-work"] });
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "That didn't work", { variant: "error" });
      setBusy(null);
    }
  };

  return (
    <Dialog open onClose={onClose} ariaLabel="Private task" variant="center">
      <DialogHeader title="Private task" onClose={onClose} />
      <div className="px-5 pb-5">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={500}
          aria-label="Title"
          className="text-base"
        />

        {/* Note doubles as a checklist: type "- [ ] step" and tick them off,
            the card shows your progress. */}
        <NoteField note={note} onChange={setNote} />

        <label className="mt-3 block">
          <span className="text-xs font-medium text-muted">Due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Due date"
            className="mt-1 block h-10 w-full rounded-control border border-line bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>

        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" loading={busy === "save"} onClick={save}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={remove}
            className="text-danger"
          >
            Delete
          </Button>
        </div>

        {/* The one door out of the wall: make it real, team-visible work. */}
        <div className="mt-5 rounded-card bg-raised p-3">
          <p className="text-xs font-medium text-muted">
            Make it a team task, visible to everyone in the project:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Project for the team task"
              className="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-2 text-sm"
            >
              <option value="">Pick a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={!projectId}
              loading={busy === "promote"}
              onClick={promote}
            >
              Move it
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
