"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellOff,
  Clock,
  Inbox,
  MessageSquare,
  Sparkles,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { apiGet, apiMutate } from "@/lib/client/api";
import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { NotificationDTO } from "@/lib/types";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useWorkspace } from "@/lib/client/workspace";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  task_assigned: Inbox,
  task_due_soon: Clock,
  task_overdue: TriangleAlert,
  comment_added: MessageSquare,
  narrative_ready: Sparkles,
  morning_brief: Sun,
};

interface NotificationsData {
  notifications: NotificationDTO[];
  unread: number;
}

export function NotificationsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { workspace } = useWorkspace();

  const { data, isLoading } = useQuery({
    queryKey: ["me", "notifications"],
    queryFn: () => apiGet<NotificationsData>("/api/me/notifications"),
    enabled: open,
    refetchOnWindowFocus: false,
  });

  const markRead = useMutation({
    mutationFn: (ids: string[] | "all") =>
      apiMutate("/api/me/notifications", { method: "POST", body: { ids } }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["me", "notifications"] });
      void qc.invalidateQueries({ queryKey: ["ws", workspace.slug, "bootstrap"] });
    },
  });

  const openItem = (n: NotificationDTO) => {
    if (!n.readAt) markRead.mutate([n.id]);
    onClose();
    const url = typeof n.payload.url === "string" ? n.payload.url : null;
    if (url) router.push(url);
  };

  const items = data?.notifications ?? [];

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="Notifications" variant="panel">
      <DialogHeader title="Notifications" onClose={onClose}>
        {(data?.unread ?? 0) > 0 && (
          <button
            onClick={() => markRead.mutate("all")}
            className="press rounded-control px-2 py-1 text-sm font-medium text-accent hover:bg-raised"
          >
            Mark all read
          </button>
        )}
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="px-4 py-16 text-center">
            <BellOff className="mx-auto size-8 text-faint" />
            <p className="mt-3 font-medium">All quiet</p>
            <p className="mt-1 text-sm text-muted">
              That’s the point. When something needs you, it lands here first.
            </p>
          </div>
        )}

        {items.map((n) => {
          const Icon = ICONS[n.type] ?? Inbox;
          const title =
            typeof n.payload.title === "string" ? n.payload.title : n.type;
          const body = typeof n.payload.body === "string" ? n.payload.body : null;
          return (
            <button
              key={n.id}
              onClick={() => openItem(n)}
              className={cn(
                "press flex w-full items-start gap-3 rounded-card px-3 py-3 text-left hover:bg-raised",
                !n.readAt && "bg-raised/60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                  n.readAt ? "bg-raised text-faint" : "bg-accent-soft text-accent",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm",
                    n.readAt ? "text-muted" : "font-medium text-ink",
                  )}
                >
                  {title}
                </span>
                {body && (
                  <span className="mt-0.5 block truncate text-sm text-muted">
                    {body}
                  </span>
                )}
                <span className="mt-0.5 block text-xs text-faint">
                  {timeAgo(n.createdAt)}
                </span>
              </span>
              {!n.readAt && (
                <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
