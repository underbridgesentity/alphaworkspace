"use client";

/**
 * Task attachments: upload photos/documents (browser → Supabase via signed
 * URL), list them, download, delete. Quota is enforced server-side.
 */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { apiGet, apiMutate, ApiError } from "@/lib/client/api";
import { raiseLimit } from "@/lib/client/tasks";
import { useWorkspace } from "@/lib/client/workspace";
import { useToast } from "@/components/ui/toast";

interface AttachmentDTO {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Attachments({ taskId }: { taskId: string }) {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data } = useQuery({
    queryKey: ["ws", workspace.slug, "attachments", taskId],
    queryFn: () =>
      apiGet<{ attachments: AttachmentDTO[] }>(
        `/api/w/${workspace.slug}/tasks/${taskId}/attachments`,
      ),
    select: (d) => d.attachments,
  });

  const upload = async (files: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const begin = await apiMutate<{
          attachmentId: string;
          uploadUrl: string;
        }>(`/api/w/${workspace.slug}/tasks/${taskId}/attachments`, {
          method: "POST",
          body: { name: file.name, mime: file.type || "application/octet-stream", sizeBytes: file.size },
        });
        if ("queued" in begin && begin.queued) {
          toast("Attachments need a connection", { variant: "error" });
          break;
        }
        const put = await fetch(begin.uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) {
          toast(`Upload failed for ${file.name}`, { variant: "error" });
          continue;
        }
        await apiMutate(`/api/w/${workspace.slug}/attachments/${begin.attachmentId}`, {
          method: "POST",
        });
      }
      await qc.invalidateQueries({
        queryKey: ["ws", workspace.slug, "attachments", taskId],
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "plan_limit") raiseLimit(err);
      else toast(err instanceof Error ? err.message : "Upload failed", { variant: "error" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    await apiMutate(`/api/w/${workspace.slug}/attachments/${id}`, { method: "DELETE" });
    await qc.invalidateQueries({
      queryKey: ["ws", workspace.slug, "attachments", taskId],
    });
  };

  const items = data ?? [];

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted">
          Files{items.length > 0 && ` (${items.length})`}
        </h3>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="press inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium text-muted hover:bg-raised hover:text-ink disabled:opacity-50"
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
          Add
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          className="hidden"
          onChange={(e) => e.target.files && e.target.files.length > 0 && upload(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <div className="mt-2 space-y-1">
          {items.map((a) => {
            const isImage = a.mime.startsWith("image/");
            return (
              <div
                key={a.id}
                className="group flex items-center gap-2.5 rounded-control bg-raised px-3 py-2"
              >
                {isImage ? (
                  <ImageIcon className="size-4 shrink-0 text-faint" />
                ) : (
                  <FileText className="size-4 shrink-0 text-faint" />
                )}
                <a
                  href={`/api/w/${workspace.slug}/attachments/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm hover:underline"
                >
                  {a.name}
                </a>
                <span className="shrink-0 text-xs text-faint">{humanSize(a.sizeBytes)}</span>
                <button
                  onClick={() => void remove(a.id)}
                  aria-label={`Remove ${a.name}`}
                  className="press rounded p-0.5 text-faint opacity-0 hover:text-danger group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
