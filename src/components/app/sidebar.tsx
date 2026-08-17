"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AudioLines,
  ChartNoAxesColumn,
  Check,
  ChevronsUpDown,
  CreditCard,
  Home,
  Plus,
  Settings,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { apiGet } from "@/lib/client/api";
import { useShell, useWorkspace } from "@/lib/client/workspace";
import { Logo } from "@/components/ui/logo";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { NewProjectDialog } from "./new-project-dialog";

export function Sidebar({ className }: { className?: string }) {
  const { workspace, projects, usage } = useWorkspace();
  const shell = useShell();
  const pathname = usePathname();
  const [newProject, setNewProject] = useState(false);

  const base = `/w/${workspace.slug}`;
  const isAdmin = workspace.role !== "member";
  const limits = usage.limits;

  return (
    <aside
      className={cn(
        // The insets are for the tablet case, where this bar IS visible inside
        // the shell and would otherwise run under the status bar and the home
        // indicator. Both are zero in a browser window.
        "sticky top-0 h-dvh flex-col border-r border-line bg-surface",
        "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]",
        className,
      )}
    >
      <div className="px-3 pt-4 pb-2">
        <Menu
          align="start"
          className="w-56"
          trigger={
            <button className="press flex w-full items-center gap-2 rounded-control px-2 py-2 hover:bg-raised">
              <Logo size="md" wordmark={false} />
              <span className="min-w-0 flex-1 truncate text-left text-body font-semibold">
                {workspace.name}
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-faint" />
            </button>
          }
        >
          {(close) => <WorkspaceMenuItems close={close} />}
        </Menu>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          <NavLink href={base} active={pathname === base} icon={Home}>
            My Work
          </NavLink>
          <NavLink
            href={`${base}/dashboard`}
            active={pathname.startsWith(`${base}/dashboard`)}
            icon={ChartNoAxesColumn}
          >
            Pulse
          </NavLink>
          <NavLink
            href={`${base}/meetings`}
            active={pathname.startsWith(`${base}/meetings`)}
            icon={AudioLines}
          >
            Meetings
          </NavLink>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between px-2 pb-1.5">
            {/* The one section-head idiom, same on every surface in the app. */}
            <span className="section-head">
              Projects
            </span>
            {isAdmin && (
              <button
                onClick={() => setNewProject(true)}
                aria-label="New project"
                className="press rounded-chip p-1.5 text-faint hover:bg-raised hover:text-ink"
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </div>
          <div className="space-y-0.5">
            {projects.map((p) => (
              <NavLink
                key={p.id}
                href={`${base}/p/${p.id}`}
                active={pathname.startsWith(`${base}/p/${p.id}`)}
                dot={p.color}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {(p.overdueCount ?? 0) > 0 && (
                  <span className="ml-auto shrink-0 rounded-full bg-danger-soft px-1.5 text-micro font-semibold tabular text-danger-quiet">
                    {p.overdueCount}
                  </span>
                )}
              </NavLink>
            ))}
            {projects.length === 0 && (
              <p className="px-2 py-1.5 text-body text-faint">
                No projects yet{isAdmin ? ", create one." : "."}
              </p>
            )}
          </div>
        </div>
      </nav>

      <div className="border-t border-line px-3 py-3 space-y-0.5">
        {/* Upgrade card: a purchase call to action, so the store shell never
            renders it (Apple 3.1.3(f) / Play Billing: consumption-only). */}
        {workspace.plan === "free" && !shell && (
          <Link
            href={`${base}/settings/billing`}
            className="press mb-2 block rounded-card bg-raised px-3 py-2.5 hover:bg-overlay"
          >
            <p className="text-meta font-semibold">Free plan</p>
            <p className="mt-hair text-meta text-muted">
              {usage.activeProjects}/{limits.maxActiveProjects ?? "∞"} projects ·{" "}
              {usage.voiceCapturesThisMonth}/{limits.voiceCapturesPerMonth} captures
            </p>
            <p className="mt-1 text-meta font-medium text-accent-quiet">Upgrade →</p>
          </Link>
        )}
        {isAdmin && (
          <NavLink
            href={`${base}/settings/members`}
            active={false}
            icon={UserPlus}
          >
            Invite your team
          </NavLink>
        )}
        <NavLink
          href={`${base}/settings`}
          active={pathname === `${base}/settings`}
          icon={Settings}
        >
          Settings
        </NavLink>
      </div>

      {newProject && <NewProjectDialog onClose={() => setNewProject(false)} />}
    </aside>
  );
}

function NavLink({
  href,
  active,
  icon: Icon,
  dot,
  children,
}: {
  href: string;
  active: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "press flex items-center gap-2.5 rounded-control px-2 py-1.5 text-body",
        active
          ? "bg-raised font-medium text-ink"
          : "text-muted hover:bg-raised hover:text-ink",
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" />}
      {dot && (
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: dot }}
        />
      )}
      {children}
    </Link>
  );
}

/**
 * Shared between the sidebar switcher (desktop) and the top bar (mobile).
 * On mobile there's no sidebar, so `nav` adds the workspace destinations
 * (Meetings, and Settings/Members/Billing for admins) that would otherwise
 * be unreachable on a phone.
 */
export function WorkspaceMenuItems({
  close,
  nav = false,
}: {
  close: () => void;
  nav?: boolean;
}) {
  const { workspace } = useWorkspace();
  const shell = useShell();
  const router = useRouter();
  const base = `/w/${workspace.slug}`;
  const isAdmin = workspace.role !== "member";
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const { data } = useQuery({
    queryKey: ["me", "workspaces"],
    queryFn: () =>
      apiGet<{ workspaces: { id: string; name: string; slug: string }[] }>(
        "/api/me/workspaces",
      ),
    staleTime: 60_000,
  });

  return (
    <>
      {nav && (
        <>
          <MenuItem onClick={() => go(`${base}/meetings`)}>
            <AudioLines className="size-4" />
            Meetings
          </MenuItem>
          {isAdmin && (
            <>
              <MenuItem onClick={() => go(`${base}/settings/members`)}>
                <UserPlus className="size-4" />
                Members &amp; invites
              </MenuItem>
              {/* No Billing entry in the store shell: the destination is the
                  plan-facts page, but the menu item itself reads as a path
                  toward purchase. */}
              {!shell && (
                <MenuItem onClick={() => go(`${base}/settings/billing`)}>
                  <CreditCard className="size-4" />
                  Billing
                </MenuItem>
              )}
              <MenuItem onClick={() => go(`${base}/settings`)}>
                <Settings className="size-4" />
                Workspace settings
              </MenuItem>
            </>
          )}
          <MenuSeparator />
        </>
      )}
      {(data?.workspaces ?? [{ id: workspace.id, name: workspace.name, slug: workspace.slug }]).map(
        (w) => (
          <MenuItem
            key={w.id}
            onClick={() => {
              close();
              if (w.slug !== workspace.slug) router.push(`/w/${w.slug}`);
            }}
          >
            <span className="min-w-0 flex-1 truncate">{w.name}</span>
            {w.slug === workspace.slug && <Check className="size-4 text-accent" />}
          </MenuItem>
        ),
      )}
      <MenuSeparator />
      <MenuItem
        onClick={() => {
          close();
          router.push("/onboarding?new=1");
        }}
      >
        <Plus className="size-4" />
        New workspace
      </MenuItem>
    </>
  );
}
