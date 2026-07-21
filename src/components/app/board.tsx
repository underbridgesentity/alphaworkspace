"use client";

/**
 * The Kanban board. Drag and drop with full keyboard support (dnd-kit),
 * horizontal snap-scroll columns on mobile, quick-add at the top of every
 * column, optimistic everything.
 */
import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { checklistProgress } from "@/lib/checklist";
import type { TaskDTO, TaskStatus } from "@/lib/types";
import { celebrateAt, useBoard, useTaskMutations } from "@/lib/client/tasks";
import { useWorkspace } from "@/lib/client/workspace";
import { useUI } from "./shell";
import { Avatar } from "@/components/ui/avatar";
import { ChecklistChip, DueChip, PriorityFlag, statusLabel } from "./status-bits";

const GAP = 1024;

export function Board({ projectId }: { projectId: string }) {
  const { workspace } = useWorkspace();
  const { data: tasks, isLoading } = useBoard(projectId);
  const { update } = useTaskMutations();

  const customName = workspace.settings.customColumn?.name ?? null;
  const columns: TaskStatus[] = customName
    ? ["todo", "in_progress", "custom", "done"]
    : ["todo", "in_progress", "done"];

  const [local, setLocal] = useState<TaskDTO[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const items = local ?? tasks ?? [];

  const byColumn = useMemo(() => {
    const map = new Map<TaskStatus, TaskDTO[]>();
    for (const c of columns) map.set(c, []);
    for (const t of items) {
      if (!map.has(t.status)) map.set(t.status, []);
      map.get(t.status)!.push(t);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, customName]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (id: string): TaskStatus | null => {
    if (columns.includes(id as TaskStatus)) return id as TaskStatus;
    const task = items.find((t) => t.id === id);
    return task ? task.status : null;
  };

  const onDragStart = (e: DragStartEvent) => {
    setLocal(tasks ?? []);
    setActiveId(String(e.active.id));
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over || !local) return;
    const activeCol = findColumn(String(active.id));
    const overCol = findColumn(String(over.id));
    if (!activeCol || !overCol || activeCol === overCol) return;
    // Move the task into the hovered column (position finalised on drop).
    setLocal((prev) =>
      (prev ?? []).map((t) =>
        t.id === active.id ? { ...t, status: overCol } : t,
      ),
    );
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const current = local;
    setLocal(null);
    setActiveId(null);
    if (!over || !current) return;

    const taskId = String(active.id);
    const task = current.find((t) => t.id === taskId);
    if (!task) return;
    const fromStatus = (tasks ?? []).find((t) => t.id === taskId)?.status;
    const targetCol = findColumn(String(over.id)) ?? task.status;

    const column = current
      .filter((t) => t.status === targetCol && t.id !== taskId)
      .sort((a, b) => a.position - b.position);

    let index = column.length;
    if (String(over.id) !== targetCol) {
      const overIndex = column.findIndex((t) => t.id === over.id);
      if (overIndex >= 0) index = overIndex;
    }

    const prev = column[index - 1]?.position;
    const next = column[index]?.position;
    const position =
      prev !== undefined && next !== undefined
        ? (prev + next) / 2
        : prev !== undefined
          ? prev + GAP
          : next !== undefined
            ? next - GAP
            : GAP;

    const statusChanged = targetCol !== fromStatus;
    if (!statusChanged && Math.abs(position - task.position) < 1e-9) return;

    update.mutate({
      taskId,
      patch: statusChanged ? { status: targetCol, position } : { position },
    });
  };

  const activeTask = activeId ? items.find((t) => t.id === activeId) : null;

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 md:flex-row md:overflow-x-auto md:overflow-y-hidden md:px-6">
        {columns.map((c) => (
          <div key={c} className="w-full space-y-2 pt-2 md:w-72 md:max-w-80 md:shrink-0">
            <div className="skeleton h-5 w-24" />
            <div className="skeleton h-20" />
            <div className="skeleton h-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setLocal(null);
        setActiveId(null);
      }}
    >
      {/* Mobile: columns stack vertically into one scroll (To do, then In
          progress below it), which reads far better on a phone than swiping
          sideways. Desktop/tablet-landscape: the classic side-by-side board. */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 md:flex-row md:overflow-x-auto md:overflow-y-hidden md:px-6">
        {columns.map((status) => (
          <Column
            key={status}
            status={status}
            customName={customName}
            projectId={projectId}
            tasks={byColumn.get(status) ?? []}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="rotate-2 opacity-95">
            <CardBody task={activeTask} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/* ------------------------------ column ----------------------------------- */

function Column({
  status,
  customName,
  projectId,
  tasks,
}: {
  status: TaskStatus;
  customName: string | null;
  projectId: string;
  tasks: TaskDTO[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      className="flex flex-col md:w-72 md:max-w-80 md:shrink-0"
      aria-label={statusLabel(status, customName)}
    >
      <header className="flex items-center gap-2 px-1 pb-2 pt-2">
        <h2 className="text-sm font-semibold">{statusLabel(status, customName)}</h2>
        <span className="text-xs tabular text-faint">{tasks.length}</span>
      </header>

      <QuickAddRow projectId={projectId} status={status} />

      <div
        ref={setNodeRef}
        className={cn(
          // Mobile: natural height, the whole board scrolls as one. Desktop:
          // each column fills the row height and scrolls on its own.
          "mt-2 space-y-2 rounded-card pb-4 transition-colors md:flex-1 md:overflow-y-auto md:pb-8",
          isOver && "bg-raised/40",
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} />
          ))}
        </SortableContext>
        {tasks.length === 0 && !isOver && (
          <p className="px-2 pt-6 text-center text-xs text-faint">
            {status === "done"
              ? "Finished work lands here."
              : "Nothing here. Drag a card over, or add one above."}
          </p>
        )}
      </div>
    </section>
  );
}

function QuickAddRow({
  projectId,
  status,
}: {
  projectId: string;
  status: TaskStatus;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { create } = useTaskMutations();

  const submit = () => {
    const v = title.trim();
    if (!v) return;
    create.mutate({
      id: crypto.randomUUID(),
      projectId,
      title: v,
      description: "",
      status,
      priority: "none",
      labelIds: [],
    });
    setTitle("");
    inputRef.current?.focus();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press flex items-center gap-1.5 rounded-control px-2 py-1.5 text-sm text-faint hover:bg-raised hover:text-muted"
      >
        <Plus className="size-4" />
        Add task
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
        if (e.key === "Escape") {
          setTitle("");
          setOpen(false);
        }
      }}
      onBlur={() => {
        submit();
        setOpen(false);
      }}
      placeholder="Task title. Enter to add"
      aria-label="New task title"
      className="w-full rounded-control bg-raised px-3 py-2 text-sm outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/30"
    />
  );
}

/* ------------------------------- card ------------------------------------ */

function SortableCard({ task }: { task: TaskDTO }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-35")}
      {...attributes}
      {...listeners}
    >
      <CardBody task={task} />
    </div>
  );
}

function CardBody({ task }: { task: TaskDTO }) {
  const { openTask } = useUI();
  const { update } = useTaskMutations();
  const done = task.status === "done";

  return (
    <div
      onClick={() => openTask(task.id)}
      role="button"
      tabIndex={-1}
      className={cn(
        "group cursor-pointer rounded-card bg-surface p-3 hover:bg-raised",
        "shadow-[0_1px_2px_rgba(0,0,0,0.14)] transition-colors",
        done && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          aria-label={done ? "Reopen task" : "Complete task"}
          onClick={(e) => {
            e.stopPropagation();
            if (!done) celebrateAt(e.clientX, e.clientY);
            update.mutate({
              taskId: task.id,
              patch: { status: done ? "todo" : "done" },
            });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "press mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            done
              ? "border-ok bg-ok text-bg"
              : "border-line-strong text-transparent hover:border-ok hover:text-ok",
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </button>
        <p
          className={cn(
            "min-w-0 flex-1 text-sm leading-snug",
            done && "text-muted line-through",
          )}
        >
          {task.title}
        </p>
      </div>

      {(task.dueDate ||
        task.priority !== "none" ||
        task.labels.length > 0 ||
        task.assignee ||
        checklistProgress(task.description)) && (
        <div className="mt-2 flex items-center gap-2 pl-6.5">
          <DueChip dueDate={task.dueDate} done={done} />
          <PriorityFlag priority={task.priority} />
          <ChecklistChip description={task.description} />
          {task.labels.slice(0, 2).map((l) => (
            <span
              key={l.id}
              title={l.name}
              className="size-2 rounded-full"
              style={{ background: l.color }}
            />
          ))}
          {task.labels.length > 2 && (
            <span className="text-[10px] text-faint">+{task.labels.length - 2}</span>
          )}
          <span className="flex-1" />
          {task.assignee && (
            <Avatar
              name={task.assignee.name}
              email={task.assignee.email}
              image={task.assignee.image}
              size={20}
            />
          )}
        </div>
      )}
    </div>
  );
}
