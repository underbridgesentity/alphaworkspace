"use client";

/**
 * Extract → SHOW → confirm. The reviewable list of proposed tasks: every
 * field editable, guessed fields visibly marked, nothing is created until
 * the human says so (product law 3).
 */
import { useMemo, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Priority, TaskProposal } from "@/lib/types";
import { useWorkspace } from "@/lib/client/workspace";
import { apiMutate, ApiError } from "@/lib/client/api";
import { raiseLimit } from "@/lib/client/tasks";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PRIORITY_LABELS } from "./status-bits";
import type { TaskDTO } from "@/lib/types";

interface EditableProposal {
  include: boolean;
  title: string;
  description: string;
  projectId: string;
  assigneeId: string | null;
  dueDate: string | null;
  priority: Priority;
  guessed: { project: boolean; assignee: boolean; dueDate: boolean };
}

export function ProposalReview({
  captureId,
  proposals,
  engine,
  defaultProjectId,
  onDone,
  onCancel,
}: {
  captureId: string;
  proposals: TaskProposal[];
  engine: string;
  defaultProjectId?: string;
  onDone: (count: number) => void;
  onCancel: () => void;
}) {
  const { workspace, projects, members } = useWorkspace();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fallbackProject = defaultProjectId ?? projects[0]?.id ?? "";

  const [rows, setRows] = useState<EditableProposal[]>(() =>
    proposals.map((p) => ({
      include: true,
      title: p.title,
      description: p.description,
      projectId: p.projectId ?? fallbackProject,
      assigneeId: p.assigneeId,
      dueDate: p.dueDate,
      priority: p.priority,
      guessed: {
        project: !p.projectId || p.projectConfidence !== "high",
        assignee: p.assigneeId !== null && p.assigneeConfidence !== "high",
        dueDate: p.dueDate !== null && p.dueDateConfidence !== "high",
      },
    })),
  );
  const [pending, setPending] = useState(false);

  const selected = useMemo(() => rows.filter((r) => r.include), [rows]);
  const valid = selected.length > 0 && selected.every((r) => r.title.trim() && r.projectId);

  const edit = (i: number, patch: Partial<EditableProposal>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const confirm = async () => {
    if (!valid || pending) return;
    setPending(true);
    try {
      const res = await apiMutate<{ tasks: TaskDTO[] }>(
        `/api/w/${workspace.slug}/captures/${captureId}/confirm`,
        {
          method: "POST",
          body: {
            tasks: selected.map((r) => ({
              id: crypto.randomUUID(),
              projectId: r.projectId,
              title: r.title.trim(),
              description: r.description,
              status: "todo",
              assigneeId: r.assigneeId,
              dueDate: r.dueDate,
              priority: r.priority,
              labelIds: [],
            })),
          },
        },
      );
      await qc.invalidateQueries({ queryKey: ["ws", workspace.slug] });
      const n = "queued" in res && res.queued ? selected.length : res.tasks.length;
      toast(n === 1 ? "Task created" : `${n} tasks created`, { variant: "success" });
      onDone(n);
    } catch (err) {
      if (err instanceof ApiError && err.code === "plan_limit") raiseLimit(err);
      else
        toast(err instanceof Error ? err.message : "Couldn't create those tasks", {
          variant: "error",
        });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-5 pb-2">
        <Sparkles className="size-4 text-accent" />
        <p className="text-sm text-muted">
          {rows.length === 1 ? "One task heard" : `${rows.length} tasks heard`} —
          check the guesses
          <span className="text-faint"> (dashed = my guess, tap to fix)</span>
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
        {rows.map((row, i) => (
          <div
            key={i}
            className={cn(
              "rounded-card bg-raised p-3 transition-opacity",
              !row.include && "opacity-45",
            )}
          >
            <div className="flex items-start gap-2.5">
              <button
                role="checkbox"
                aria-checked={row.include}
                aria-label={row.include ? "Skip this task" : "Include this task"}
                onClick={() => edit(i, { include: !row.include })}
                className={cn(
                  "press mt-1 flex size-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                  row.include
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line-strong text-transparent",
                )}
              >
                <Check className="size-3.5" strokeWidth={3} />
              </button>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  value={row.title}
                  onChange={(e) => edit(i, { title: e.target.value })}
                  aria-label={`Task ${i + 1} title`}
                  className="h-9 bg-overlay font-medium"
                />
                {row.description && (
                  <p className="whitespace-pre-wrap text-xs text-muted">
                    {row.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Project */}
                  <GuessSelect
                    guessed={row.guessed.project}
                    ariaLabel="Project"
                    value={row.projectId}
                    onChange={(v) =>
                      edit(i, {
                        projectId: v,
                        guessed: { ...row.guessed, project: false },
                      })
                    }
                    options={projects.map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Pick a project"
                  />
                  {/* Assignee */}
                  <GuessSelect
                    guessed={row.guessed.assignee}
                    ariaLabel="Assignee"
                    value={row.assigneeId ?? ""}
                    onChange={(v) =>
                      edit(i, {
                        assigneeId: v || null,
                        guessed: { ...row.guessed, assignee: false },
                      })
                    }
                    options={[
                      { value: "", label: "Unassigned" },
                      ...members.map((m) => ({
                        value: m.id,
                        label: m.name ?? m.email,
                      })),
                    ]}
                  />
                  {/* Due date */}
                  <label
                    className={cn(
                      "flex h-8 items-center gap-1 rounded-control bg-overlay px-2 text-xs",
                      row.guessed.dueDate && "outline-dashed outline-1 outline-accent/60",
                    )}
                  >
                    <span className="sr-only">Due date</span>
                    <input
                      type="date"
                      value={row.dueDate ?? ""}
                      onChange={(e) =>
                        edit(i, {
                          dueDate: e.target.value || null,
                          guessed: { ...row.guessed, dueDate: false },
                        })
                      }
                      className="bg-transparent outline-none [color-scheme:inherit]"
                    />
                  </label>
                  {/* Priority */}
                  <GuessSelect
                    guessed={false}
                    ariaLabel="Priority"
                    value={row.priority}
                    onChange={(v) => edit(i, { priority: v as Priority })}
                    options={(["none", "low", "med", "high"] as Priority[]).map(
                      (p) => ({ value: p, label: PRIORITY_LABELS[p] }),
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-5 py-3">
        <p className="flex-1 text-xs text-faint">
          via {engine === "heuristic" ? "offline parser" : engine}
        </p>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Discard
        </Button>
        <Button onClick={confirm} loading={pending} disabled={!valid}>
          {selected.length <= 1
            ? "Create task"
            : `Create ${selected.length} tasks`}
        </Button>
      </div>
    </div>
  );
}

function GuessSelect({
  value,
  onChange,
  options,
  guessed,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  guessed: boolean;
  ariaLabel: string;
  placeholder?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-8 items-center rounded-control bg-overlay",
        guessed && "outline-dashed outline-1 outline-accent/60",
        !value && placeholder && "outline-dashed outline-1 outline-danger/60",
      )}
    >
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-transparent py-1 pl-2 pr-6 text-xs outline-none"
      >
        {placeholder && !value && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 size-3 text-faint" />
    </span>
  );
}
