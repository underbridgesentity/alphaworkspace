"use client";

/**
 * The private list on My Work: personal to-dos only their owner ever sees
 * (the server never returns anyone else's, admins included). Promoting an
 * item is the one door out, it becomes an ordinary team task in a project.
 */
import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Lock, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  bulletsToSteps,
  checklistProgress,
  hasPlainBullets,
} from "@/lib/checklist";
import { isDueToday, isOverdue } from "@/lib/dates";
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
  const total = open.length + done.length;
  const pct = total ? Math.round((done.length / total) * 100) : 0;
  // Roll every task's checklist up into one steps figure, so the header
  // answers "where is this at" without opening each item.
  const steps = (data ?? []).reduce(
    (acc, t) => {
      const p = checklistProgress(t.note);
      if (p) {
        acc.done += p.done;
        acc.total += p.total;
      }
      return acc;
    },
    { done: 0, total: 0 },
  );

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
    <section className="mt-section" aria-label="Private tasks">
      <div className="flex items-center gap-1.5 px-3">
        {/* faint-mark, not faint: this is a glyph, not text, so it keeps the
            lighter tone that would fail contrast on a word. */}
        <Lock className="size-3.5 text-faint-mark" />
        <h2 className="section-head">
          Private
        </h2>
        <span className="text-micro font-normal text-faint">
          · only you see these
        </span>
      </div>

      {/* At-a-glance progress on the ledger line: the figure sits on a rule
          that fills to its own share, so the list reports itself. */}
      {total > 0 && (
        <div className="mt-tight px-3">
          <div className="ledger flex items-baseline justify-between gap-2">
            <span className="text-meta text-faint">
              {done.length} of {total} done
              {steps.total > 0 && ` · ${steps.done}/${steps.total} steps`}
            </span>
            <span className="num text-meta text-muted">{pct}%</span>
            <span
              className="ledger-track"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Private tasks done"
            >
              <span
                className="ledger-fill"
                style={{ "--fill": pct / 100 } as CSSProperties}
              />
            </span>
          </div>
        </div>
      )}

      <div className="mt-sibling e2 p-2">
        {/* The plus sits exactly where every row's toggle sits, so the field
            reads as the next row rather than as a separate control. */}
        <form
          className="flex items-center gap-3 px-3"
          onSubmit={(e) => {
            e.preventDefault();
            const t = title.trim();
            if (!t) return;
            setTitle("");
            add.mutate(t);
          }}
        >
          <Plus className="size-5 shrink-0 text-faint-mark" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a private task…"
            maxLength={500}
            aria-label="Add a private task"
            className="h-10 min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
          />
        </form>

        {open.length > 0 && (
          <div className="mt-hair space-y-0.5">
            {open.map((t) => (
              <Row key={t.id} task={t} onToggle={toggle} onOpen={setEditing} />
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div className="mt-tight border-t border-line pt-tight">
            <button
              onClick={() => setShowDone(!showDone)}
              className="press flex items-center gap-1 rounded-control px-2 py-1.5 text-meta text-faint hover:text-muted"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform duration-(--dur-quick)",
                  !showDone && "-rotate-90",
                )}
              />
              Done <span className="num">{done.length}</span>
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

/**
 * The follow-up rail for a private row. Urgency outranks privacy: a personal
 * task that is already late still has to look late. The dashed rail is what a
 * private item wears when it has nothing urgent to say, which is the one place
 * the dash earns its keep instead of just repeating the section's own lock.
 */
function railTone(task: PrivateTaskDTO): string {
  if (task.completedAt) return "rail-done";
  if (isOverdue(task.dueDate)) return "rail-overdue";
  if (isDueToday(task.dueDate)) return "rail-today";
  const steps = checklistProgress(task.note);
  if (steps && steps.done > 0 && steps.done < steps.total) return "rail-active";
  return "rail-private";
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
    <div
      className={cn(
        // px-3 py-3 and a size-5 circle, exactly matching TaskRow: the two
        // lists sit on the same My Work page, so their left edges and row
        // heights have to agree or the page reads as two products.
        "group flex items-center gap-3 rounded-control px-3 py-3 hover:bg-raised",
        "transition-[box-shadow,background-color] duration-(--dur-quick) ease-move",
        "rail",
        railTone(task),
      )}
    >
      <button
        // Per-task label, not "Mark done": a screen reader on a list of ten
        // private tasks otherwise hears the same three words ten times.
        aria-label={`Mark "${task.title}" complete`}
        aria-pressed={isDone}
        onClick={() => onToggle(task)}
        // -m-3 p-3 gives the 20px circle a 44px target that exactly fills the
        // 44px row, so no two rows' hit areas overlap.
        className="group/check -m-3 flex shrink-0 items-center justify-center p-3"
      >
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full border-2",
            "transition-[background-color,border-color,scale] duration-(--dur-base) ease-spring",
            // --ok, not --accent: done is green in every other list in the
            // app, and teal here would make completion look like selection.
            isDone
              ? "scale-100 border-ok bg-ok text-bg"
              : "scale-95 border-line-strong group-hover/check:border-ok",
          )}
        >
          {isDone && (
            <svg viewBox="0 0 10 8" className="size-2" fill="none" aria-hidden>
              <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </span>
      </button>
      <button
        onClick={() => onOpen(task)}
        className={cn(
          "min-w-0 flex-1 truncate text-left",
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
  const ref = useRef<HTMLTextAreaElement>(null);

  const toggle = (lineIndex: number, checked: boolean) => {
    const lines = note.split("\n");
    lines[lineIndex] = lines[lineIndex].replace(
      /- \[( |x|X)\]/,
      `- [${checked ? "x" : " "}]`,
    );
    onChange(lines.join("\n"));
  };

  // Typing "- [ ]" by hand is a convention nobody discovers. This writes it.
  const addStep = () => {
    const trimmed = note.replace(/\s*$/, "");
    onChange(trimmed ? `${trimmed}\n- [ ] ` : "- [ ] ");
    setEditing(true);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  return (
    <>
      {editing ? (
        <textarea
          ref={ref}
          value={note}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(note.trim().length === 0)}
          placeholder="A note, only for you. Add steps to tick off below."
          maxLength={5000}
          rows={3}
          aria-label="Note"
          className="mt-2 w-full resize-none rounded-control border border-line bg-surface px-3 py-2.5 text-base leading-relaxed outline-none placeholder:text-faint focus:border-accent"
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="mt-2 min-h-[3rem] cursor-text rounded-control border border-line bg-surface px-3 py-2.5 text-body leading-relaxed"
        >
          <RichText text={note} onToggleCheck={toggle} />
        </div>
      )}

      {/* mousedown is prevented so the textarea doesn't blur out from under
          the tap and shift the layout before the click lands. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addStep}
          className="press text-meta font-medium text-accent-quiet"
        >
          + Add step
        </button>
        {hasPlainBullets(note) && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(bulletsToSteps(note))}
            className="press text-meta text-muted underline decoration-line underline-offset-2 hover:text-ink"
          >
            Make these tickable
          </button>
        )}
      </div>
    </>
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

        {/* Note doubles as a checklist: "Add step" writes the checkbox syntax
            so it can be ticked off, and the card shows your progress. */}
        <NoteField note={note} onChange={setNote} />

        <label className="mt-item block">
          <span className="text-meta font-medium text-muted">Due date</span>
          <span className="relative mt-1 block">
            <input
              type="date"
              data-empty={!dueDate}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Due date"
              className="block h-10 w-full rounded-control border border-line bg-surface px-3 text-base outline-none focus:border-accent"
            />
            {!dueDate && (
              <span className="pointer-events-none absolute inset-0 flex items-center px-3 text-base text-faint">
                Add a date
              </span>
            )}
          </span>
        </label>

        <div className="mt-item flex items-center gap-2">
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
        <div className="mt-group e1 p-3">
          <p className="text-meta font-medium text-muted">
            Make it a team task, visible to everyone in the project:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Project for the team task"
              className="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-2 text-dense"
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
