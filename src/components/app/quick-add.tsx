"use client";

/**
 * Natural-language quick-add: one line in, one structured task out, after
 * you've seen and confirmed it. "homepage concepts for Sable, Thabo,
 * Friday" is the whole flow.
 */
import { useState } from "react";
import { ArrowRight, Zap } from "lucide-react";
import type { TaskProposal } from "@/lib/types";
import { apiMutate } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { ProposalReview } from "./proposal-review";

interface ExtractResponse {
  captureId: string;
  proposals: TaskProposal[];
  engine: string;
}

export function QuickAddDialog({
  defaultProjectId,
  onClose,
}: {
  defaultProjectId?: string;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [line, setLine] = useState("");
  const [phase, setPhase] = useState<"input" | "extracting" | "review">("input");
  const [result, setResult] = useState<ExtractResponse | null>(null);

  const extract = async () => {
    const transcript = line.trim();
    if (!transcript) return;
    setPhase("extracting");
    try {
      const res = await apiMutate<ExtractResponse>(
        `/api/w/${workspace.slug}/ai/extract`,
        { method: "POST", body: { transcript, source: "quickadd" } },
      );
      if ("queued" in res && res.queued) {
        toast("You're offline, quick-add needs a connection for parsing", {
          variant: "error",
        });
        setPhase("input");
        return;
      }
      setResult(res);
      setPhase("review");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't parse that", {
        variant: "error",
      });
      setPhase("input");
    }
  };

  const discard = async () => {
    if (result) {
      void apiMutate(
        `/api/w/${workspace.slug}/captures/${result.captureId}/discard`,
        { method: "POST" },
      ).catch(() => undefined);
    }
    onClose();
  };

  return (
    <Dialog open onClose={onClose} ariaLabel="Quick add task" variant="center" className="sm:max-w-2xl">
      <DialogHeader title="Quick add" onClose={onClose} />

      {phase === "input" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void extract();
          }}
          className="px-5 pb-5"
        >
          <div className="flex items-center gap-2 rounded-card bg-raised px-3.5 focus-within:ring-2 focus-within:ring-accent/40">
            <Zap className="size-4 shrink-0 text-accent" />
            <input
              autoFocus
              value={line}
              onChange={(e) => setLine(e.target.value)}
              placeholder="homepage concepts for Sable, Thabo, Friday"
              aria-label="Describe the task"
              maxLength={500}
              className="h-12 w-full bg-transparent text-[1.0625rem] outline-none placeholder:text-faint"
            />
            <button
              type="submit"
              disabled={!line.trim()}
              aria-label="Parse into a task"
              className="press flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40"
            >
              <ArrowRight className="size-4" />
            </button>
          </div>
          <p className="mt-2.5 text-xs text-faint">
            Write it how you’d say it, project, person and day get picked up.
            You confirm before anything is created.
          </p>
        </form>
      )}

      {phase === "extracting" && (
        <div className="flex items-center justify-center gap-3 px-5 pb-10 pt-6">
          <Spinner />
          <p className="text-sm text-muted">Structuring your task…</p>
        </div>
      )}

      {phase === "review" && result && (
        <ProposalReview
          captureId={result.captureId}
          proposals={result.proposals}
          engine={result.engine}
          defaultProjectId={defaultProjectId}
          onDone={onClose}
          onCancel={() => void discard()}
        />
      )}
    </Dialog>
  );
}
