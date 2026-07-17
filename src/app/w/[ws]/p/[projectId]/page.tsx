"use client";

/**
 * Project workspace: board (default) / list / calendar via ?view=.
 */
import { Suspense, use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Calendar,
  Check,
  Columns3,
  List,
  Mic,
  MoreHorizontal,
  Pencil,
  Plus,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { ProjectDTO } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { useWorkspace } from "@/lib/client/workspace";
import { apiMutate } from "@/lib/client/api";
import { useQueryClient } from "@tanstack/react-query";
import { Board } from "@/components/app/board";
import { ListView } from "@/components/app/list-view";
import { CalendarView } from "@/components/app/calendar-view";
import { useUI } from "@/components/app/shell";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const VIEWS = [
  { key: "board", label: "Board", icon: Columns3 },
  { key: "list", label: "List", icon: List },
  { key: "calendar", label: "Calendar", icon: Calendar },
] as const;

function ProjectInner({ projectId }: { projectId: string }) {
  const { workspace, projects } = useWorkspace();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { openMic, openQuickAdd } = useUI();
  const view = searchParams.get("view") ?? "board";
  const project = projects.find((p) => p.id === projectId);
  const [renaming, setRenaming] = useState(false);
  const isAdmin = workspace.role !== "member";

  const setView = (v: string) => {
    const params = new URLSearchParams(searchParams);
    if (v === "board") params.delete("view");
    else params.set("view", v);
    const qs = params.toString();
    router.replace(
      qs ? `/w/${workspace.slug}/p/${projectId}?${qs}` : `/w/${workspace.slug}/p/${projectId}`,
      { scroll: false },
    );
  };

  if (!project) {
    return (
      <div className="px-6 pt-16 text-center">
        <p className="font-medium">This project isn’t here</p>
        <p className="mt-1 text-sm text-muted">
          It may have been archived or removed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col pb-16 md:pb-0">
      <header className="flex items-center gap-2 px-4 pb-1 pt-4 md:px-6">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ background: project.color }}
        />
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">
          {project.name}
        </h1>
        {project.clientName && (
          <span className="hidden shrink-0 rounded-full bg-raised px-2 py-0.5 text-xs text-muted sm:inline">
            {project.clientName}
          </span>
        )}
        <LeadPicker project={project} canEdit={isAdmin} />
        <div className="flex-1" />

        <button
          onClick={() => openQuickAdd(projectId)}
          aria-label="New task in this project"
          className="press hidden h-8 items-center gap-1 rounded-control bg-raised px-2.5 text-sm font-medium hover:bg-overlay sm:flex"
        >
          <Plus className="size-4" /> Task
        </button>
        <button
          onClick={() => openMic(projectId)}
          aria-label="Voice capture into this project"
          className="press hidden size-8 items-center justify-center rounded-full bg-accent-soft text-accent hover:bg-accent hover:text-on-accent sm:flex"
        >
          <Mic className="size-4" />
        </button>

        {isAdmin && (
          <Menu
            align="end"
            trigger={
              <button
                aria-label="Project options"
                className="press rounded-control p-1.5 text-muted hover:bg-raised hover:text-ink"
              >
                <MoreHorizontal className="size-5" />
              </button>
            }
          >
            {(close) => (
              <ProjectMenu
                projectId={projectId}
                close={close}
                onRename={() => setRenaming(true)}
              />
            )}
          </Menu>
        )}
      </header>

      {/* View switcher */}
      <div className="flex items-center gap-1 px-4 pb-3 pt-2 md:px-6">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={cn(
              "press flex h-8 items-center gap-1.5 rounded-control px-2.5 text-sm",
              view === v.key
                ? "bg-raised font-medium text-ink"
                : "text-muted hover:bg-raised/60",
            )}
          >
            <v.icon className="size-4" />
            {v.label}
          </button>
        ))}
      </div>

      {view === "board" && <Board projectId={projectId} />}
      {view === "list" && (
        <div className="flex-1 overflow-y-auto pt-1">
          <ListView projectId={projectId} />
        </div>
      )}
      {view === "calendar" && (
        <div className="flex-1 overflow-y-auto pt-1">
          <CalendarView projectId={projectId} />
        </div>
      )}

      {renaming && (
        <RenameDialog project={project} onClose={() => setRenaming(false)} />
      )}
    </div>
  );
}

/**
 * Who's accountable for this project. Admins pick from members; everyone
 * else sees the lead at a glance. Lives in the header so ownership is never
 * a question someone has to ask.
 */
function LeadPicker({
  project,
  canEdit,
}: {
  project: ProjectDTO;
  canEdit: boolean;
}) {
  const { workspace, members } = useWorkspace();
  const qc = useQueryClient();
  const { toast } = useToast();

  const setLead = async (leadId: string | null) => {
    try {
      await apiMutate(`/api/w/${workspace.slug}/projects/${project.id}`, {
        method: "PATCH",
        body: { leadId },
      });
      await qc.invalidateQueries({ queryKey: ["ws", workspace.slug] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't change the lead", {
        variant: "error",
      });
    }
  };

  const chip = (
    <button
      aria-label={
        project.lead
          ? `Project lead: ${project.lead.name ?? project.lead.email}`
          : "Set a project lead"
      }
      disabled={!canEdit}
      className={cn(
        "press flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line px-2 text-xs text-muted",
        canEdit && "hover:border-line-strong hover:text-ink",
      )}
    >
      {project.lead ? (
        <>
          <Avatar
            name={project.lead.name}
            email={project.lead.email}
            image={project.lead.image}
            size={16}
          />
          <span className="hidden max-w-28 truncate sm:inline">
            {(project.lead.name ?? project.lead.email).split(" ")[0]}
          </span>
          <span className="hidden text-faint sm:inline">lead</span>
        </>
      ) : (
        <>
          <UserPlus className="size-3.5" />
          <span className="hidden sm:inline">Lead</span>
        </>
      )}
    </button>
  );

  if (!canEdit) return project.lead ? chip : null;

  return (
    <Menu trigger={chip}>
      {(close) => (
        <>
          {members.map((m) => (
            <MenuItem
              key={m.id}
              onClick={() => {
                close();
                if (m.id !== project.leadId) void setLead(m.id);
              }}
            >
              <Avatar name={m.name} email={m.email} image={m.image} size={20} />
              <span className="min-w-0 flex-1 truncate">{m.name ?? m.email}</span>
              {m.id === project.leadId && <Check className="size-4 text-accent" />}
            </MenuItem>
          ))}
          {project.leadId && (
            <MenuItem
              onClick={() => {
                close();
                void setLead(null);
              }}
            >
              Remove lead
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  );
}

function ProjectMenu({
  projectId,
  close,
  onRename,
}: {
  projectId: string;
  close: () => void;
  onRename: () => void;
}) {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();

  return (
    <>
      <MenuItem
        onClick={() => {
          close();
          onRename();
        }}
      >
        <Pencil className="size-4" /> Edit project
      </MenuItem>
      <MenuItem
        onClick={async () => {
          close();
          await apiMutate(`/api/w/${workspace.slug}/projects/${projectId}`, {
            method: "PATCH",
            body: { status: "archived" },
          });
          await qc.invalidateQueries({ queryKey: ["ws", workspace.slug] });
          toast("Project archived, nothing was deleted");
          router.push(`/w/${workspace.slug}`);
        }}
      >
        <Archive className="size-4" /> Archive project
      </MenuItem>
    </>
  );
}

function RenameDialog({
  project,
  onClose,
}: {
  project: { id: string; name: string; clientName: string | null };
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const [name, setName] = useState(project.name);
  const [clientName, setClientName] = useState(project.clientName ?? "");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    await apiMutate(`/api/w/${workspace.slug}/projects/${project.id}`, {
      method: "PATCH",
      body: { name: name.trim(), clientName: clientName.trim() || null },
    });
    await qc.invalidateQueries({ queryKey: ["ws", workspace.slug] });
    setPending(false);
    onClose();
  };

  return (
    <Dialog open onClose={onClose} ariaLabel="Edit project" variant="center">
      <DialogHeader title="Edit project" onClose={onClose} />
      <form onSubmit={submit} className="space-y-3 px-5 pb-5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Project name"
          required
          maxLength={120}
        />
        <Input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Client (optional)"
          aria-label="Client name"
          maxLength={120}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return (
    <Suspense>
      <ProjectInner projectId={projectId} />
    </Suspense>
  );
}
