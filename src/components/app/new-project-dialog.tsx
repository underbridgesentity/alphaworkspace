"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiMutate, ApiError } from "@/lib/client/api";
import { raiseLimit } from "@/lib/client/tasks";
import { useWorkspace } from "@/lib/client/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { ProjectDTO } from "@/lib/types";

const COLORS = [
  "#5B7C99", "#6FAE87", "#D9A13B", "#7A9BD1",
  "#B48EAD", "#8FA876", "#66757C", "#A46D8C",
];

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      const res = await apiMutate<{ project: ProjectDTO }>(
        `/api/w/${workspace.slug}/projects`,
        {
          method: "POST",
          body: {
            name: name.trim(),
            color,
            clientName: clientName.trim() || null,
          },
        },
      );
      await qc.invalidateQueries({ queryKey: ["ws", workspace.slug, "bootstrap"] });
      onClose();
      if (!("queued" in res && res.queued)) {
        router.push(`/w/${workspace.slug}/p/${res.project.id}`);
      } else {
        toast("Project will appear once you're back online");
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "plan_limit") {
        onClose();
        raiseLimit(err);
      } else {
        toast(err instanceof Error ? err.message : "Couldn't create the project", {
          variant: "error",
        });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onClose={onClose} ariaLabel="New project" variant="center">
      <DialogHeader title="New project" onClose={onClose} />
      <form onSubmit={submit} className="space-y-4 px-5 pb-5">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name — e.g. Spring campaign"
          aria-label="Project name"
          maxLength={120}
          required
        />
        <Input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Client (optional) — e.g. Karoo Coffee Co."
          aria-label="Client name"
          maxLength={120}
        />
        <div className="flex items-center gap-2" role="radiogroup" aria-label="Project colour">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              onClick={() => setColor(c)}
              className={cn(
                "press size-7 rounded-full",
                color === c && "ring-2 ring-accent ring-offset-2 ring-offset-overlay",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} disabled={!name.trim()}>
            Create project
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
