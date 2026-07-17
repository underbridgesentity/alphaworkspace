"use client";

/**
 * Task data hooks: queries plus optimistic, offline-aware mutations.
 * Every mutation updates the visible caches immediately, then reconciles
 * with the server response (or leaves the optimistic state standing when
 * the write went to the outbox).
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "./api";
import { useWorkspace } from "./workspace";
import { useToast } from "@/components/ui/toast";
import type { CommentDTO, CommentReactionDTO, TaskDTO } from "@/lib/types";
import type { TaskCreateInput, TaskUpdateInput } from "@/lib/validators";
import type { ActivityDTO } from "@/lib/types";

export interface TaskDetailData {
  task: TaskDTO;
  comments: CommentDTO[];
  activity: ActivityDTO[];
}

/* ------------------------------ queries ---------------------------------- */

export function useBoard(projectId: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["ws", workspace.slug, "board", projectId],
    queryFn: () =>
      apiGet<{ tasks: TaskDTO[] }>(
        `/api/w/${workspace.slug}/projects/${projectId}/tasks`,
      ),
    select: (d) => d.tasks,
  });
}

export function useMyWork() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["ws", workspace.slug, "my-work"],
    queryFn: () => apiGet<{ tasks: TaskDTO[] }>(`/api/w/${workspace.slug}/my-work`),
    select: (d) => d.tasks,
  });
}

export function useTaskDetail(taskId: string | null) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["ws", workspace.slug, "task", taskId],
    queryFn: () =>
      apiGet<TaskDetailData>(`/api/w/${workspace.slug}/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

export function useCalendar(from: string, to: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["ws", workspace.slug, "calendar", from, to],
    queryFn: () =>
      apiGet<{ tasks: TaskDTO[] }>(
        `/api/w/${workspace.slug}/calendar?from=${from}&to=${to}`,
      ),
    select: (d) => d.tasks,
  });
}

/* --------------------------- cache surgery ------------------------------- */

function patchTaskEverywhere(
  qc: QueryClient,
  slug: string,
  taskId: string,
  patch: Partial<TaskDTO>,
) {
  for (const [key, data] of qc.getQueriesData<{ tasks: TaskDTO[] }>({
    queryKey: ["ws", slug],
  })) {
    const kind = key[2];
    if ((kind === "board" || kind === "my-work" || kind === "calendar") && data) {
      qc.setQueryData(key, {
        ...data,
        tasks: data.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
      });
    }
  }
  const detailKey = ["ws", slug, "task", taskId];
  const detail = qc.getQueryData<TaskDetailData>(detailKey);
  if (detail) {
    qc.setQueryData(detailKey, {
      ...detail,
      task: { ...detail.task, ...patch },
    });
  }
}

function removeTaskEverywhere(qc: QueryClient, slug: string, taskId: string) {
  for (const [key, data] of qc.getQueriesData<{ tasks: TaskDTO[] }>({
    queryKey: ["ws", slug],
  })) {
    const kind = key[2];
    if ((kind === "board" || kind === "my-work" || kind === "calendar") && data) {
      qc.setQueryData(key, {
        ...data,
        tasks: data.tasks.filter((t) => t.id !== taskId),
      });
    }
  }
}

function snapshot(qc: QueryClient, slug: string) {
  return qc.getQueriesData<unknown>({ queryKey: ["ws", slug] });
}

function restore(qc: QueryClient, snap: ReturnType<typeof snapshot>) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

/** Surfaces plan-limit errors as the global upgrade prompt. */
export function raiseLimit(err: ApiError) {
  window.dispatchEvent(
    new CustomEvent("aw:limit", {
      detail: { limit: err.limit, message: err.message },
    }),
  );
}

export function celebrateAt(x: number, y: number) {
  window.dispatchEvent(new CustomEvent("aw:celebrate", { detail: { x, y } }));
}

/* ------------------------------ mutations -------------------------------- */

export function useTaskMutations() {
  const { workspace, me } = useWorkspace();
  const qc = useQueryClient();
  const { toast } = useToast();
  const slug = workspace.slug;

  const update = useMutation({
    mutationFn: async (vars: { taskId: string; patch: TaskUpdateInput }) =>
      apiMutate<{ task: TaskDTO }>(`/api/w/${slug}/tasks/${vars.taskId}`, {
        method: "PATCH",
        body: vars.patch,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["ws", slug] });
      const snap = snapshot(qc, slug);
      const now = new Date().toISOString();
      patchTaskEverywhere(qc, slug, vars.taskId, {
        ...(vars.patch as Partial<TaskDTO>),
        updatedAt: now,
        ...(vars.patch.status === "done" ? { completedAt: now } : {}),
        ...(vars.patch.status && vars.patch.status !== "done"
          ? { completedAt: null }
          : {}),
      });
      return { snap };
    },
    onError: (err, _vars, ctx) => {
      if (ctx) restore(qc, ctx.snap);
      if (err instanceof ApiError && err.code === "plan_limit") raiseLimit(err);
      else toast(err instanceof Error ? err.message : "Couldn't save that", { variant: "error" });
    },
    onSuccess: (res, vars) => {
      if (!("queued" in res && res.queued)) {
        patchTaskEverywhere(qc, slug, vars.taskId, res.task);
      }
      void qc.invalidateQueries({ queryKey: ["ws", slug, "task", vars.taskId] });
    },
  });

  const create = useMutation({
    mutationFn: async (input: TaskCreateInput & { id: string }) =>
      apiMutate<{ task: TaskDTO }>(`/api/w/${slug}/tasks`, {
        method: "POST",
        body: input,
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["ws", slug] });
      const snap = snapshot(qc, slug);
      const optimistic: TaskDTO = {
        id: input.id,
        workspaceId: workspace.id,
        projectId: input.projectId,
        title: input.title,
        description: input.description ?? "",
        status: input.status ?? "todo",
        assigneeId: input.assigneeId ?? null,
        assignee:
          input.assigneeId === me.id
            ? { id: me.id, name: me.name, email: me.email, image: me.image }
            : null,
        dueDate: input.dueDate ?? null,
        priority: input.priority ?? "none",
        position: input.position ?? Number.MAX_SAFE_INTEGER,
        labels: [],
        createdBy: me.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
        recurrence: input.recurrence ?? null,
      };
      const boardKey = ["ws", slug, "board", input.projectId];
      const board = qc.getQueryData<{ tasks: TaskDTO[] }>(boardKey);
      if (board) qc.setQueryData(boardKey, { tasks: [...board.tasks, optimistic] });
      if (input.assigneeId === me.id) {
        const myKey = ["ws", slug, "my-work"];
        const mine = qc.getQueryData<{ tasks: TaskDTO[] }>(myKey);
        if (mine) qc.setQueryData(myKey, { tasks: [...mine.tasks, optimistic] });
      }
      return { snap };
    },
    onError: (err, _input, ctx) => {
      if (ctx) restore(qc, ctx.snap);
      if (err instanceof ApiError && err.code === "plan_limit") raiseLimit(err);
      else toast(err instanceof Error ? err.message : "Couldn't create the task", { variant: "error" });
    },
    onSuccess: (res, input) => {
      if (!("queued" in res && res.queued)) {
        patchTaskEverywhere(qc, slug, input.id, res.task);
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (taskId: string) =>
      apiMutate<{ ok: true }>(`/api/w/${slug}/tasks/${taskId}`, {
        method: "DELETE",
      }),
    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: ["ws", slug] });
      const snap = snapshot(qc, slug);
      removeTaskEverywhere(qc, slug, taskId);
      return { snap };
    },
    onError: (err, _taskId, ctx) => {
      if (ctx) restore(qc, ctx.snap);
      toast(err instanceof Error ? err.message : "Couldn't delete that", { variant: "error" });
    },
  });

  const comment = useMutation({
    mutationFn: async (vars: { taskId: string; id: string; body: string }) =>
      apiMutate<{ comment: CommentDTO }>(
        `/api/w/${slug}/tasks/${vars.taskId}/comments`,
        { method: "POST", body: { id: vars.id, body: vars.body } },
      ),
    onMutate: async (vars) => {
      const detailKey = ["ws", slug, "task", vars.taskId];
      await qc.cancelQueries({ queryKey: detailKey });
      const detail = qc.getQueryData<TaskDetailData>(detailKey);
      if (detail) {
        qc.setQueryData(detailKey, {
          ...detail,
          comments: [
            ...detail.comments,
            {
              id: vars.id,
              taskId: vars.taskId,
              body: vars.body,
              createdAt: new Date().toISOString(),
              author: { id: me.id, name: me.name, email: me.email, image: me.image },
            },
          ],
        });
      }
      return { detail };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.detail) {
        qc.setQueryData(["ws", slug, "task", vars.taskId], ctx.detail);
      }
      toast(err instanceof Error ? err.message : "Comment didn't send", { variant: "error" });
    },
    onSettled: (_res, _err, vars) => {
      void qc.invalidateQueries({ queryKey: ["ws", slug, "task", vars.taskId] });
    },
  });

  const react = useMutation({
    mutationFn: async (vars: { taskId: string; commentId: string; emoji: string }) =>
      apiMutate<{ added: boolean }>(
        `/api/w/${slug}/comments/${vars.commentId}/react`,
        { method: "POST", body: { emoji: vars.emoji } },
      ),
    onMutate: async (vars) => {
      const detailKey = ["ws", slug, "task", vars.taskId];
      await qc.cancelQueries({ queryKey: detailKey });
      const detail = qc.getQueryData<TaskDetailData>(detailKey);
      if (detail) {
        qc.setQueryData(detailKey, {
          ...detail,
          comments: detail.comments.map((c) =>
            c.id === vars.commentId
              ? { ...c, reactions: toggleLocalReaction(c.reactions ?? [], vars.emoji) }
              : c,
          ),
        });
      }
      return { detail };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.detail) {
        qc.setQueryData(["ws", slug, "task", vars.taskId], ctx.detail);
      }
      toast(err instanceof Error ? err.message : "Reaction didn't stick", { variant: "error" });
    },
    onSettled: (_res, _err, vars) => {
      void qc.invalidateQueries({ queryKey: ["ws", slug, "task", vars.taskId] });
    },
  });

  return { update, create, remove, comment, react };
}

/** Mirror the server's toggle on the cached aggregate. */
function toggleLocalReaction(
  reactions: CommentReactionDTO[],
  emoji: string,
): CommentReactionDTO[] {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (!existing) return [...reactions, { emoji, count: 1, mine: true }];
  if (existing.mine) {
    return reactions
      .map((r) =>
        r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r,
      )
      .filter((r) => r.count > 0);
  }
  return reactions.map((r) =>
    r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r,
  );
}
