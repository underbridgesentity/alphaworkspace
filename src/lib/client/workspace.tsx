"use client";

/**
 * Workspace context for the app surface. Server-rendered bootstrap seeds the
 * cache (no waterfall); the query keeps it fresh and the service worker
 * keeps it available offline.
 */
import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { MemberDTO, LabelDTO, ProjectDTO, UserLite, Role } from "@/lib/types";
import type { Entitlements } from "@/lib/plans";

export interface BootstrapData {
  workspace: {
    id: string;
    name: string;
    slug: string;
    plan: "free" | "team" | "studio";
    role: Role;
    settings: {
      staleDays?: number;
      customColumn?: { name: string } | null;
      whatsappDoorbell?: boolean;
    };
  };
  me: UserLite;
  projects: ProjectDTO[];
  members: MemberDTO[];
  labels: LabelDTO[];
  usage: {
    members: number;
    activeProjects: number;
    voiceCapturesThisMonth: number;
    limits: Entitlements;
  };
  unread: number;
}

const WorkspaceContext = createContext<BootstrapData | null>(null);

export function WorkspaceProvider({
  slug,
  initial,
  children,
}: {
  slug: string;
  initial: BootstrapData;
  children: React.ReactNode;
}) {
  const { data } = useQuery({
    queryKey: ["ws", slug, "bootstrap"],
    queryFn: () => apiGet<BootstrapData>(`/api/w/${slug}/bootstrap`),
    initialData: initial,
    staleTime: 60_000,
  });

  return (
    <WorkspaceContext.Provider value={data}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): BootstrapData {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace outside WorkspaceProvider");
  return ctx;
}

/** Invalidate helpers keyed the way the app queries are. */
export function useInvalidate() {
  const qc = useQueryClient();
  return {
    bootstrap: (slug: string) =>
      qc.invalidateQueries({ queryKey: ["ws", slug, "bootstrap"] }),
    board: (slug: string, projectId: string) =>
      qc.invalidateQueries({ queryKey: ["ws", slug, "board", projectId] }),
    myWork: (slug: string) =>
      qc.invalidateQueries({ queryKey: ["ws", slug, "my-work"] }),
    task: (slug: string, taskId: string) =>
      qc.invalidateQueries({ queryKey: ["ws", slug, "task", taskId] }),
    all: (slug: string) => qc.invalidateQueries({ queryKey: ["ws", slug] }),
  };
}
