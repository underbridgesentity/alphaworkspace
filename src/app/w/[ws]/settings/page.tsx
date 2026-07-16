"use client";

/**
 * General workspace settings — the whole page is four decisions. If a
 * feature needed more than this, it should have been redesigned.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiMutate } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export default function GeneralSettingsPage() {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState(workspace.name);
  const [staleDays, setStaleDays] = useState(workspace.settings.staleDays ?? 5);
  const [customColumn, setCustomColumn] = useState(
    workspace.settings.customColumn?.name ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiMutate(`/api/w/${workspace.slug}/settings`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          staleDays,
          customColumn: customColumn.trim() ? { name: customColumn.trim() } : null,
        },
      });
      await qc.invalidateQueries({ queryKey: ["ws", workspace.slug] });
      toast("Settings saved", { variant: "success" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save", { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const destroy = async () => {
    setDeleting(true);
    try {
      await apiMutate(`/api/w/${workspace.slug}`, { method: "DELETE" });
      router.push("/app");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't delete", { variant: "error" });
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <Field label="Workspace name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>

        <Field
          label="Stale after"
          hint="Days without activity before a task counts as stale on the dashboard and in the briefing."
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={2}
              max={30}
              value={staleDays}
              onChange={(e) => setStaleDays(Number(e.target.value))}
              className="w-24 tabular"
            />
            <span className="text-sm text-muted">days</span>
          </div>
        </Field>

        <Field
          label="Extra board column"
          hint="Optional fourth column between In progress and Done — e.g. “Review”. Leave empty for the calm three."
        >
          <Input
            value={customColumn}
            onChange={(e) => setCustomColumn(e.target.value)}
            placeholder="e.g. Review"
            maxLength={30}
          />
        </Field>

        <Field
          label="WhatsApp doorbell"
          hint="Outbound-only nudges (“New task assigned — open Alpha”) arrive in a later release. Never two-way, never an input surface."
        >
          <label className="flex items-center gap-2 text-sm text-faint">
            <input type="checkbox" disabled checked={false} className="size-4" />
            Coming later — off by default
          </label>
        </Field>

        <Button onClick={() => void save()} loading={saving}>
          Save changes
        </Button>
      </section>

      {workspace.role === "owner" && (
        <section className="rounded-card border border-danger/25 p-4">
          <h2 className="text-sm font-semibold text-danger">Delete workspace</h2>
          <p className="mt-1 text-sm text-muted">
            Permanent, POPIA-grade deletion: every project, task, comment,
            capture and report in{" "}
            <span className="font-medium text-ink">{workspace.name}</span> is
            erased. There is no undo.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={`Type “${workspace.name}” to confirm`}
              aria-label="Confirm workspace name"
            />
            <Button
              variant="danger"
              disabled={confirmName !== workspace.name}
              loading={deleting}
              onClick={() => void destroy()}
            >
              Delete forever
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}
