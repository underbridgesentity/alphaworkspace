"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Search, SearchX } from "lucide-react";
import { apiGet } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import { cn } from "@/lib/cn";
import type { ProjectDTO, TaskDTO } from "@/lib/types";
import { Dialog } from "@/components/ui/dialog";
import { StatusDot } from "./status-bits";

interface SearchData {
  tasks: TaskDTO[];
  projects: ProjectDTO[];
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Mounted fresh on every open, state resets for free, no effects needed.
  return (
    <Dialog open={open} onClose={onClose} ariaLabel="Search" variant="center">
      {open && <PaletteBody onClose={onClose} />}
    </Dialog>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const debounced = useDebounced(q.trim(), 220);

  const { data, isFetching } = useQuery({
    queryKey: ["ws", workspace.slug, "search", debounced],
    queryFn: () =>
      apiGet<SearchData>(
        `/api/w/${workspace.slug}/search?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: debounced.length >= 2,
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => {
    const tasks = (data?.tasks ?? []).map((t) => ({ kind: "task" as const, t }));
    const projects = (data?.projects ?? []).map((p) => ({
      kind: "project" as const,
      p,
    }));
    return [...tasks, ...projects];
  }, [data]);

  const activeIdx = Math.min(active, Math.max(rows.length - 1, 0));

  const go = (index: number) => {
    const row = rows[index];
    if (!row) return;
    onClose();
    if (row.kind === "task") {
      router.push(`/w/${workspace.slug}/p/${row.t.projectId}?task=${row.t.id}`);
    } else {
      router.push(`/w/${workspace.slug}/p/${row.p.id}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIdx + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(activeIdx);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="size-4.5 shrink-0 text-faint" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search tasks and projects…"
          aria-label="Search"
          className="h-13 w-full bg-transparent py-4 text-[1.0625rem] outline-none placeholder:text-faint"
        />
        {isFetching && (
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" />
        )}
        {/* Touch has no Escape key: a visible tap target to leave, always. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="press -mr-1 shrink-0 rounded-control px-2.5 py-1.5 text-sm text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <div className="max-h-[55dvh] overflow-y-auto p-2">
        {debounced.length < 2 ? (
          <p className="px-3 py-8 text-center text-sm text-faint">
            Type at least two characters. Tasks and projects, this workspace
            only.
          </p>
        ) : rows.length === 0 && !isFetching ? (
          <div className="px-3 py-10 text-center">
            <SearchX className="mx-auto size-6 text-faint" />
            <p className="mt-2 text-sm text-muted">
              Nothing matches “{debounced}”.
            </p>
          </div>
        ) : (
          rows.map((row, i) => (
            <button
              key={row.kind === "task" ? row.t.id : row.p.id}
              onClick={() => go(i)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left",
                i === activeIdx ? "bg-raised" : "hover:bg-raised/60",
              )}
            >
              {row.kind === "task" ? (
                <>
                  <StatusDot status={row.t.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{row.t.title}</span>
                    <span className="block truncate text-xs text-faint">
                      {row.t.projectName}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <FolderKanban
                    className="size-4 shrink-0"
                    style={{ color: row.p.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{row.p.name}</span>
                    {row.p.clientName && (
                      <span className="block truncate text-xs text-faint">
                        {row.p.clientName}
                      </span>
                    )}
                  </span>
                </>
              )}
            </button>
          ))
        )}
      </div>
    </>
  );
}
