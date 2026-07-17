"use client";

/**
 * Task detail slide-over: inline edit everything, comments, activity.
 * Every change is optimistic; offline edits queue silently.
 */
import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  Check,
  ChevronDown,
  CircleCheck,
  Flag,
  FolderKanban,
  Plus,
  RefreshCw,
  Repeat,
  SmilePlus,
  Tag,
  Trash2,
  User,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays, timeAgo, todaySAST } from "@/lib/dates";
import { REACTION_EMOJI } from "@/lib/reactions";
import type {
  Priority,
  TaskStatus,
  ActivityDTO,
  CommentReactionDTO,
} from "@/lib/types";
import {
  celebrateAt,
  useTaskDetail,
  useTaskMutations,
} from "@/lib/client/tasks";
import { useWorkspace } from "@/lib/client/workspace";
import { apiMutate } from "@/lib/client/api";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import {
  DueChip,
  LabelChip,
  PRIORITY_LABELS,
  statusLabel,
  StatusDot,
} from "./status-bits";
import { Attachments } from "./attachments";
import { MentionInput } from "./mention-input";
import { RichText } from "./rich-text";
import { TaskTime } from "./timer";
import type { LabelDTO } from "@/lib/types";

const RECUR_LABELS: Record<"daily" | "weekly" | "monthly", string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function TaskPanel({
  taskId,
  onClose,
}: {
  taskId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!taskId}
      onClose={onClose}
      ariaLabel="Task details"
      variant="panel"
    >
      {taskId && <PanelBody key={taskId} taskId={taskId} onClose={onClose} />}
    </Dialog>
  );
}

function PanelBody({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { workspace, members, labels, projects } = useWorkspace();
  const { data, isLoading, isError } = useTaskDetail(taskId);
  const { update, remove, comment, react } = useTaskMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const task = data?.task;
  const customName = workspace.settings.customColumn?.name;

  const patch = (p: Parameters<typeof update.mutate>[0]["patch"]) =>
    update.mutate({ taskId, patch: p });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (isError || !task) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="font-medium">This task is out of reach</p>
        <p className="text-sm text-muted">
          It may have been deleted, or you might be offline and it isn’t cached
          yet.
        </p>
        <Button variant="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const project = projects.find((p) => p.id === task.projectId);
  const statuses: TaskStatus[] = customName
    ? ["todo", "in_progress", "custom", "done"]
    : ["todo", "in_progress", "done"];

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
        <Menu
          trigger={
            <button className="press flex min-w-0 items-center gap-2 rounded-control px-2 py-1 text-sm text-muted hover:bg-raised">
              <FolderKanban
                className="size-4 shrink-0"
                style={{ color: project?.color }}
              />
              <span className="truncate">{project?.name ?? "Project"}</span>
              <ChevronDown className="size-3.5 shrink-0 text-faint" />
            </button>
          }
        >
          {(close) =>
            projects.map((p) => (
              <MenuItem
                key={p.id}
                onClick={() => {
                  close();
                  if (p.id !== task.projectId) patch({ projectId: p.id });
                }}
              >
                <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.id === task.projectId && <Check className="size-4 text-accent" />}
              </MenuItem>
            ))
          }
        </Menu>
        <div className="flex-1" />
        {task.status !== "done" ? (
          <Button
            size="sm"
            onClick={(e) => {
              celebrateAt(e.clientX, e.clientY);
              patch({ status: "done" });
            }}
          >
            <CircleCheck className="size-4" />
            Complete
          </Button>
        ) : (
          <Button size="sm" variant="quiet" onClick={() => patch({ status: "todo" })}>
            <RefreshCw className="size-4" />
            Reopen
          </Button>
        )}
        <button
          onClick={onClose}
          aria-label="Close"
          className="press rounded-control p-1.5 text-muted hover:bg-raised hover:text-ink"
        >
          <ChevronDown className="size-5 rotate-[-90deg] sm:rotate-0" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 sm:px-5">
          {task.status === "done" && task.completedAt && (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok">
              <Check className="size-3.5" /> Done · {timeAgo(task.completedAt)}
            </p>
          )}

          <TitleEditor
            key={`title-${task.updatedAt}`}
            initial={task.title}
            done={task.status === "done"}
            onSave={(title) => title !== task.title && patch({ title })}
          />

          {/* Meta grid */}
          <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {/* Status */}
            <Menu
              trigger={
                <MetaButton icon={<StatusDot status={task.status} className="size-3.5" />}>
                  {statusLabel(task.status, customName)}
                </MetaButton>
              }
            >
              {(close) =>
                statuses.map((s) => (
                  <MenuItem
                    key={s}
                    onClick={() => {
                      close();
                      if (s !== task.status) patch({ status: s });
                    }}
                  >
                    <StatusDot status={s} className="size-3.5" />
                    <span className="flex-1">{statusLabel(s, customName)}</span>
                    {s === task.status && <Check className="size-4 text-accent" />}
                  </MenuItem>
                ))
              }
            </Menu>

            {/* Assignee */}
            <Menu
              trigger={
                <MetaButton
                  icon={
                    task.assignee ? (
                      <Avatar
                        name={task.assignee.name}
                        email={task.assignee.email}
                        image={task.assignee.image}
                        size={18}
                      />
                    ) : (
                      <User className="size-4 text-faint" />
                    )
                  }
                >
                  {task.assignee ? (task.assignee.name ?? task.assignee.email) : "Assign"}
                </MetaButton>
              }
            >
              {(close) => (
                <>
                  {members.map((m) => (
                    <MenuItem
                      key={m.id}
                      onClick={() => {
                        close();
                        if (m.id !== task.assigneeId) patch({ assigneeId: m.id });
                      }}
                    >
                      <Avatar name={m.name} email={m.email} image={m.image} size={20} />
                      <span className="min-w-0 flex-1 truncate">
                        {m.name ?? m.email}
                      </span>
                      {m.id === task.assigneeId && (
                        <Check className="size-4 text-accent" />
                      )}
                    </MenuItem>
                  ))}
                  {task.assigneeId && (
                    <>
                      <MenuSeparator />
                      <MenuItem
                        onClick={() => {
                          close();
                          patch({ assigneeId: null });
                        }}
                      >
                        Unassign
                      </MenuItem>
                    </>
                  )}
                </>
              )}
            </Menu>

            {/* Due date */}
            <Menu
              trigger={
                <MetaButton icon={<Calendar className="size-4 text-faint" />}>
                  {task.dueDate ? (
                    <DueChip
                      dueDate={task.dueDate}
                      done={task.status === "done"}
                      className="text-sm"
                    />
                  ) : (
                    "Due date"
                  )}
                </MetaButton>
              }
              className="w-60 p-3"
            >
              {(close) => <DuePicker task={task} patch={patch} close={close} />}
            </Menu>

            {/* Priority */}
            <Menu
              trigger={
                <MetaButton
                  icon={
                    <Flag
                      className={cn(
                        "size-4",
                        task.priority === "high"
                          ? "fill-current text-danger"
                          : task.priority === "med"
                            ? "text-warn"
                            : task.priority === "low"
                              ? "text-muted"
                              : "text-faint",
                      )}
                    />
                  }
                >
                  {PRIORITY_LABELS[task.priority]}
                </MetaButton>
              }
            >
              {(close) =>
                (["none", "low", "med", "high"] as Priority[]).map((p) => (
                  <MenuItem
                    key={p}
                    onClick={() => {
                      close();
                      if (p !== task.priority) patch({ priority: p });
                    }}
                  >
                    <Flag
                      className={cn(
                        "size-4",
                        p === "high"
                          ? "text-danger"
                          : p === "med"
                            ? "text-warn"
                            : "text-faint",
                      )}
                    />
                    <span className="flex-1">{PRIORITY_LABELS[p]}</span>
                    {p === task.priority && <Check className="size-4 text-accent" />}
                  </MenuItem>
                ))
              }
            </Menu>

            {/* Recurrence */}
            <Menu
              trigger={
                <MetaButton icon={<Repeat className="size-4 text-faint" />}>
                  {task.recurrence
                    ? RECUR_LABELS[task.recurrence.freq]
                    : "Repeat"}
                </MetaButton>
              }
            >
              {(close) => (
                <>
                  {(["daily", "weekly", "monthly"] as const).map((freq) => (
                    <MenuItem
                      key={freq}
                      onClick={() => {
                        close();
                        patch({ recurrence: { freq } });
                      }}
                    >
                      <Repeat className="size-4 text-faint" />
                      <span className="flex-1">{RECUR_LABELS[freq]}</span>
                      {task.recurrence?.freq === freq && (
                        <Check className="size-4 text-accent" />
                      )}
                    </MenuItem>
                  ))}
                  {task.recurrence && (
                    <>
                      <MenuSeparator />
                      <MenuItem onClick={() => { close(); patch({ recurrence: null }); }}>
                        Don&apos;t repeat
                      </MenuItem>
                    </>
                  )}
                </>
              )}
            </Menu>

            {/* Time (Studio) */}
            <TaskTime taskId={taskId} />
          </div>

          {task.recurrence && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-faint">
              <Repeat className="size-3.5" />
              Completing this creates the next one ({RECUR_LABELS[task.recurrence.freq].toLowerCase()}).
            </p>
          )}

          {/* Labels */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {task.labels.map((l) => (
              <LabelChip key={l.id} name={l.name} color={l.color} />
            ))}
            <LabelPicker
              taskLabels={task.labels}
              allLabels={labels}
              onChange={(labelIds) => patch({ labelIds })}
            />
          </div>

          {/* Description */}
          <DescriptionEditor
            key={`desc-${taskId}`}
            initial={task.description}
            onSave={(description) =>
              description !== task.description && patch({ description })
            }
          />

          {/* Attachments */}
          <Attachments taskId={taskId} />

          {/* Activity */}
          <details className="mt-6 group">
            <summary className="cursor-pointer select-none text-sm font-medium text-faint hover:text-muted">
              Activity ({data.activity.length})
            </summary>
            <div className="mt-2 space-y-2 border-l border-line pl-4">
              {data.activity.map((a) => (
                <ActivityRow key={a.id} activity={a} />
              ))}
            </div>
          </details>

          {/* Comments */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-muted">
              Comments{data.comments.length > 0 && ` (${data.comments.length})`}
            </h3>
            <div className="mt-3 space-y-4">
              {data.comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <Avatar
                    name={c.author.name}
                    email={c.author.email}
                    image={c.author.image}
                    size={26}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">
                        {c.author.name ?? c.author.email}
                      </span>{" "}
                      <span className="text-xs text-faint">{timeAgo(c.createdAt)}</span>
                    </p>
                    <RichText text={c.body} className="mt-0.5 text-sm text-ink/90" />
                    <ReactionBar
                      reactions={c.reactions ?? []}
                      onToggle={(emoji) =>
                        react.mutate({ taskId, commentId: c.id, emoji })
                      }
                    />
                  </div>
                </div>
              ))}
              {data.comments.length === 0 && (
                <p className="text-sm text-faint">
                  No comments, when the work needs a conversation, have it
                  here, not on WhatsApp.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Composer + danger zone */}
      <div className="border-t border-line px-4 py-3 sm:px-5">
        <MentionInput
          onSend={(body) =>
            comment.mutate({ taskId, id: crypto.randomUUID(), body })
          }
        />
        <div className="mt-2 flex justify-end">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Delete this task?</span>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  remove.mutate(taskId);
                  onClose();
                }}
              >
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="press inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs text-faint hover:text-danger"
            >
              <Trash2 className="size-3.5" />
              Delete task
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------ pieces ----------------------------------- */

function MetaButton({
  icon,
  children,
  ...rest
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  // Spreads the props Menu injects via cloneElement (onClick, aria-*).
  // Without this the menus never open. Learned the hard way.
  return (
    <button
      {...rest}
      className="press flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm hover:bg-raised"
    >
      <span className="flex size-5 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

/**
 * Reaction chips + picker under a comment. A tap on a chip toggles your own
 * reaction; the smiley opens the fixed palette.
 */
function ReactionBar({
  reactions,
  onToggle,
}: {
  reactions: CommentReactionDTO[];
  onToggle: (emoji: string) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onToggle(r.emoji)}
          aria-label={`${r.emoji} ${r.count}, ${r.mine ? "remove your reaction" : "react"}`}
          aria-pressed={r.mine}
          className={cn(
            "press flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs tabular-nums",
            r.mine
              ? "border-accent/40 bg-accent-soft text-ink"
              : "border-line text-muted hover:border-line-strong hover:text-ink",
          )}
        >
          <span className="text-[13px] leading-none">{r.emoji}</span>
          {r.count}
        </button>
      ))}
      <Menu
        trigger={
          <button
            aria-label="Add reaction"
            className="press flex size-6 items-center justify-center rounded-full text-faint hover:bg-raised hover:text-ink"
          >
            <SmilePlus className="size-3.5" />
          </button>
        }
        className="min-w-0"
      >
        {(close) => (
          <div className="flex gap-0.5 px-1 py-0.5">
            {REACTION_EMOJI.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  close();
                  onToggle(emoji);
                }}
                aria-label={`React with ${emoji}`}
                className="press flex size-8 items-center justify-center rounded-control text-base hover:bg-raised"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </Menu>
    </div>
  );
}

function TitleEditor({
  initial,
  done,
  onSave,
}: {
  initial: string;
  done: boolean;
  onSave: (title: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight}px`;
    }
  };
  useEffect(resize, []);

  return (
    <textarea
      ref={ref}
      defaultValue={initial}
      rows={1}
      onInput={resize}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v) onSave(v);
        else e.target.value = initial;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      aria-label="Task title"
      className={cn(
        "w-full resize-none bg-transparent text-xl font-semibold tracking-tight outline-none",
        "placeholder:text-faint",
        done && "text-muted line-through",
      )}
    />
  );
}

function DescriptionEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Rendered (checkboxes/links live) when idle; raw textarea while editing.
  const [editing, setEditing] = useState(initial.trim().length === 0);
  const [value, setValue] = useState(initial);

  const resize = () => {
    const el = ref.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${Math.max(el.scrollHeight, 60)}px`;
    }
  };
  useEffect(() => {
    if (editing) resize();
  }, [editing]);

  const commit = (v: string) => {
    setValue(v);
    if (v !== initial) onSave(v);
    setEditing(v.trim().length === 0);
  };

  /** Toggle a `- [ ]` line from the rendered view without entering edit mode. */
  const toggleCheck = (lineIndex: number, checked: boolean) => {
    const lines = value.split("\n");
    lines[lineIndex] = lines[lineIndex].replace(
      /- \[( |x|X)\]/,
      `- [${checked ? "x" : " "}]`,
    );
    const next = lines.join("\n");
    setValue(next);
    onSave(next);
  };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="mt-4 cursor-text rounded-card bg-surface p-3.5 text-[0.9375rem] leading-relaxed"
      >
        <RichText text={value} onToggleCheck={toggleCheck} />
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      autoFocus
      defaultValue={value}
      onInput={resize}
      onBlur={(e) => commit(e.target.value)}
      placeholder="Add context, links, decisions, a - [ ] checklist. Plain text keeps it light."
      aria-label="Description"
      className="mt-4 w-full resize-none rounded-card bg-surface p-3.5 text-[0.9375rem] leading-relaxed outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/30"
    />
  );
}

function DuePicker({
  task,
  patch,
  close,
}: {
  task: { dueDate: string | null };
  patch: (p: { dueDate: string | null }) => void;
  close: () => void;
}) {
  const today = todaySAST();
  const set = (d: string | null) => {
    patch({ dueDate: d });
    close();
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <QuickChip onClick={() => set(today)}>Today</QuickChip>
        <QuickChip onClick={() => set(addDays(today, 1))}>Tomorrow</QuickChip>
        <QuickChip onClick={() => set(addDays(today, 7))}>Next week</QuickChip>
        {task.dueDate && <QuickChip onClick={() => set(null)}>Clear</QuickChip>}
      </div>
      <input
        type="date"
        defaultValue={task.dueDate ?? ""}
        onChange={(e) => e.target.value && set(e.target.value)}
        aria-label="Pick a due date"
        className="w-full rounded-control bg-raised px-3 py-2 text-sm outline-none [color-scheme:inherit]"
      />
    </div>
  );
}

function QuickChip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="press rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-muted hover:bg-overlay hover:text-ink"
    >
      {children}
    </button>
  );
}

function LabelPicker({
  taskLabels,
  allLabels,
  onChange,
}: {
  taskLabels: LabelDTO[];
  allLabels: LabelDTO[];
  onChange: (labelIds: string[]) => void;
}) {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const current = new Set(taskLabels.map((l) => l.id));

  const toggle = (id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const createLabel = async () => {
    const name = newLabel.trim();
    if (!name) return;
    setNewLabel("");
    const res = await apiMutate<{ label: LabelDTO }>(
      `/api/w/${workspace.slug}/labels`,
      { method: "POST", body: { name, color: "#66757C" } },
    );
    await qc.invalidateQueries({ queryKey: ["ws", workspace.slug, "bootstrap"] });
    if (!("queued" in res && res.queued)) onChange([...current, res.label.id]);
  };

  return (
    <Menu
      trigger={
        <button className="press inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2 py-0.5 text-xs text-faint hover:text-muted">
          <Tag className="size-3" />
          Label
        </button>
      }
      className="w-56"
    >
      {() => (
        <>
          {allLabels.map((l) => (
            <MenuItem key={l.id} onClick={() => toggle(l.id)}>
              <span className="size-2.5 rounded-full" style={{ background: l.color }} />
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
              {current.has(l.id) && <Check className="size-4 text-accent" />}
            </MenuItem>
          ))}
          {allLabels.length > 0 && <MenuSeparator />}
          <div className="flex items-center gap-1 px-1.5 pb-1">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createLabel();
                }
              }}
              placeholder="New label…"
              aria-label="New label name"
              className="h-8 w-full rounded-control bg-raised px-2 text-sm outline-none placeholder:text-faint"
            />
            <button
              onClick={() => void createLabel()}
              aria-label="Create label"
              className="press rounded-control p-1.5 text-muted hover:bg-raised"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </>
      )}
    </Menu>
  );
}

function ActivityRow({ activity }: { activity: ActivityDTO }) {
  const who = activity.actor?.name ?? activity.actor?.email ?? "Someone";
  const text = humanize(activity);
  return (
    <p className="text-xs text-faint">
      <span className="font-medium text-muted">{who}</span> {text}{" "}
      <span>· {timeAgo(activity.createdAt)}</span>
    </p>
  );
}

function humanize(a: ActivityDTO): string {
  const d = a.data as Record<string, unknown>;
  switch (a.type) {
    case "task_created":
      return "created this task";
    case "task_completed":
      return "completed this task";
    case "task_reopened":
      return "reopened this task";
    case "task_status_changed":
      return `moved it from ${STATUS_TEXT[String(d.from)] ?? d.from} to ${STATUS_TEXT[String(d.to)] ?? d.to}`;
    case "task_assigned":
      return "changed the assignee";
    case "task_updated": {
      const fields = Array.isArray(d.fields) ? d.fields.join(", ") : "details";
      return `updated ${fields}`;
    }
    case "comment_added":
      return "commented";
    case "attachment_added":
      return `attached ${typeof d.name === "string" ? d.name : "a file"}`;
    default:
      return a.type.replaceAll("_", " ");
  }
}

const STATUS_TEXT: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  custom: "the custom column",
};
