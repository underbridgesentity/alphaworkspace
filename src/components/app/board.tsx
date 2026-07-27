"use client";

/**
 * The Kanban board. Drag and drop with full keyboard support (dnd-kit),
 * horizontal snap-scroll columns on mobile, quick-add at the top of every
 * column, optimistic everything.
 */
import { useMemo, useRef, useState, type KeyboardEventHandler } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
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
import {
  ChecklistChip,
  DueChip,
  PriorityFlag,
  STATUS_LABELS,
  railTone,
  statusLabel,
} from "./status-bits";

const GAP = 1024;

/**
 * Space picks a card up and Space puts it down. dnd-kit's default also binds
 * Enter, which is why a keyboard user could reorder the board but never open a
 * single card: Enter started a drag before the card ever saw it. Enter now
 * belongs to the card.
 */
const KEYBOARD_CODES = {
  start: ["Space"],
  cancel: ["Escape"],
  end: ["Space"],
};

const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    "Press Enter to open this task. Press Space to pick it up, then the arrow keys to move it between columns, Space to drop it, Escape to cancel.",
};

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
  // Memoised so the derived column map and the drag announcements are not
  // rebuilt on every render of a surface people keep open all day.
  const items = useMemo(() => local ?? tasks ?? [], [local, tasks]);

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
    // Mouse drags after a small move; touch needs a short press-and-hold so a
    // finger swipe still SCROLLS the stacked mobile board instead of grabbing
    // a card. A quick tap still opens the task.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: KEYBOARD_CODES,
    }),
  );

  // dnd-kit's stock announcements interpolate the draggable id, and ours are
  // client-generated UUIDs, so a screen reader user heard "Picked up draggable
  // item 8f14e45f-ceea-...". Titles and column names instead.
  const announcements = useMemo<Announcements>(() => {
    const nameOf = (id: UniqueIdentifier | undefined) => {
      const task = items.find((t) => t.id === String(id));
      return task ? task.title : "task";
    };
    const columnOf = (id: UniqueIdentifier | undefined) => {
      const task = items.find((t) => t.id === String(id));
      if (task) return statusLabel(task.status, customName);
      const key = String(id) as TaskStatus;
      return key in STATUS_LABELS ? statusLabel(key, customName) : null;
    };
    return {
      onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
      onDragOver: ({ active, over }) => {
        const column = columnOf(over?.id);
        return column
          ? `${nameOf(active.id)} is over ${column}.`
          : `${nameOf(active.id)} is not over a column.`;
      },
      onDragEnd: ({ active, over }) => {
        const column = columnOf(over?.id);
        return column
          ? `${nameOf(active.id)} dropped in ${column}.`
          : `${nameOf(active.id)} was returned.`;
      },
      onDragCancel: ({ active }) => `Cancelled. ${nameOf(active.id)} returned.`,
    };
  }, [items, customName]);

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
      accessibility={{
        announcements,
        screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
      }}
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
        {/* The one section-head idiom in the app: the cards are the content,
            the column only has to say which pile you are looking at. */}
        <h2 className="section-head">
          {statusLabel(status, customName)}
        </h2>
        <span className="text-micro tabular text-faint">{tasks.length}</span>
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
          // A drop target, not a sentence. The dashed edge borrows the
          // marketing site's language and says what the space is for.
          <p className="mt-1 rounded-card border border-dashed border-line-strong px-3 py-8 text-center text-meta text-faint">
            {status === "done" ? "Finished work lands here" : "Drop work here"}
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
        className="press flex items-center gap-1.5 rounded-control px-2 py-1.5 text-dense text-faint hover:bg-raised hover:text-muted"
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
      className="w-full rounded-control bg-raised px-3 py-2 text-body outline-none placeholder:text-faint focus:ring-2 focus:ring-accent-ring"
    />
  );
}

/* ------------------------------- card ------------------------------------ */

/** What a sortable card hands its body so the card itself is the drag handle. */
type DragBindings = {
  ref: (node: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
};

function SortableCard({ task }: { task: TaskDTO }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  // The wrapper is presentation only. It used to carry dnd-kit's attributes,
  // which meant role="button" tabIndex=0 sitting OUTSIDE a second role="button"
  // that had tabIndex={-1}: keyboard focus landed on the drag wrapper and the
  // card underneath could never be opened. One button now, and it is the card.
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-35")}
    >
      <CardBody
        task={task}
        drag={{ ref: setActivatorNodeRef, attributes, listeners }}
      />
    </div>
  );
}

function CardBody({ task, drag }: { task: TaskDTO; drag?: DragBindings }) {
  const { openTask } = useUI();
  const { update } = useTaskMutations();
  const done = task.status === "done";

  // dnd-kit listens for Space on the activator; keep its handler alive and
  // take Enter for opening.
  const dragKeyDown = drag?.listeners?.onKeyDown as
    | KeyboardEventHandler<HTMLDivElement>
    | undefined;

  return (
    <div
      ref={drag?.ref}
      {...(drag?.attributes ?? {})}
      {...(drag?.listeners ?? {})}
      // Without drag bindings this is the DragOverlay clone: a picture of the
      // card being dragged, and the real one is still in the list.
      role={drag ? "button" : undefined}
      tabIndex={drag ? 0 : undefined}
      aria-hidden={drag ? undefined : true}
      aria-label={drag ? `Open task: ${task.title}` : undefined}
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => {
        // A key pressed inside the complete toggle belongs to the toggle:
        // without this, Space on the toggle also picked the card up to drag.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter") {
          e.preventDefault();
          openTask(task.id);
          return;
        }
        dragKeyDown?.(e);
      }}
      className={cn(
        "group cursor-pointer rounded-card bg-surface p-3 shadow-e2",
        // The rail rides in the inset slot so it composes with the card's own
        // elevation instead of overwriting it.
        "inset-shadow-[2px_0_0_0_var(--rail,transparent)]",
        "transition-[box-shadow,translate,background-color] duration-(--dur-quick) ease-move",
        "motion-safe:hover:-translate-y-px hover:shadow-e3",
        railTone(task),
        done && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          aria-label={`Mark "${task.title}" complete`}
          aria-pressed={done}
          // The overlay clone is aria-hidden, so nothing inside it may be
          // reachable by tab.
          tabIndex={drag ? undefined : -1}
          onClick={(e) => {
            e.stopPropagation();
            if (!done) celebrateAt(e.clientX, e.clientY);
            update.mutate({
              taskId: task.id,
              patch: { status: done ? "todo" : "done" },
            });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          // -m-3 p-3 gives an 18px circle a 44px target and moves no layout.
          // pt-3.5 keeps the optical 2px drop that lined the circle up with
          // the first line of the title.
          className="group/check -m-3 flex shrink-0 p-3 pt-3.5"
        >
          <span
            className={cn(
              "flex size-4.5 items-center justify-center rounded-full border-2",
              // Spring, not ease: the circle overshoots as it fills. This is
              // the gesture people make dozens of times a day.
              "transition-[background-color,border-color,scale] duration-(--dur-base) ease-spring",
              done
                ? "scale-100 border-ok bg-ok text-bg"
                : "scale-95 border-line-strong text-transparent group-hover/check:border-ok group-hover/check:text-ok",
            )}
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
        </button>
        <p
          className={cn(
            "min-w-0 flex-1 text-body",
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
            <span className="text-micro text-faint">+{task.labels.length - 2}</span>
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
