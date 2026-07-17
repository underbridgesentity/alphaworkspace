"use client";

/**
 * The app chrome: sidebar (desktop), top bar, bottom tab bar with the centre
 * mic FAB (mobile — thumb-reachable, per the product spec), and the global
 * overlays (task panel, search, quick-add, voice capture, notifications).
 */
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  ChartNoAxesColumn,
  FolderKanban,
  Home,
  Mic,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/client/workspace";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { ThemeToggleItem, ThemeToggleButton } from "@/components/ui/theme-toggle";
import dynamic from "next/dynamic";
import { Sidebar, WorkspaceMenuItems } from "./sidebar";
import { TaskPanel } from "./task-panel";
import { SearchPalette } from "./search-palette";
import { NotificationsPanel } from "./notifications-panel";

// Capture surfaces are code-split — they only load when summoned, keeping
// the app shell inside the 3G budget.
const QuickAddDialog = dynamic(
  () => import("./quick-add").then((m) => m.QuickAddDialog),
  { ssr: false },
);
const VoiceCaptureSheet = dynamic(
  () => import("./voice-capture").then((m) => m.VoiceCaptureSheet),
  { ssr: false },
);
import { OfflineBadge } from "./offline-badge";
import { Celebration } from "./celebration";
import { UpgradePrompt } from "./upgrade-prompt";

interface UIState {
  openTask: (id: string) => void;
  closeTask: () => void;
  openSearch: () => void;
  openQuickAdd: (projectId?: string) => void;
  openMic: (projectId?: string) => void;
  openNotifications: () => void;
}

const UIContext = createContext<UIState | null>(null);

export function useUI(): UIState {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI outside AppShell");
  return ctx;
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { workspace, me, unread } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const taskId = searchParams.get("task");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ projectId?: string } | null>(null);
  const [mic, setMic] = useState<{ projectId?: string } | null>(null);

  const openTask = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("task", id);
      router.push(`${pathname}?${params}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const closeTask = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("task");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  // Global shortcuts: ⌘K search, N quick-add (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      const el = document.activeElement;
      const editing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable) ||
        document.querySelector("dialog[open]");
      if (!editing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === "n") {
          e.preventDefault();
          setQuickAdd({});
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ui: UIState = {
    openTask,
    closeTask,
    openSearch: () => setSearchOpen(true),
    openQuickAdd: (projectId) => setQuickAdd({ projectId }),
    openMic: (projectId) => setMic({ projectId }),
    openNotifications: () => setNotifOpen(true),
  };

  const base = `/w/${workspace.slug}`;

  return (
    <UIContext.Provider value={ui}>
      <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
        <Sidebar className="hidden md:flex" />

        <div className="flex min-h-dvh min-w-0 flex-col pb-16 md:pb-0">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-1.5 border-b border-line bg-bg/90 px-3 backdrop-blur-sm sm:px-4 md:px-6">
            {/* Mobile: workspace name/menu */}
            <div className="min-w-0 flex-1 md:hidden">
              <Menu
                align="start"
                trigger={
                  <button className="press flex max-w-full items-center gap-2 rounded-control px-1.5 py-1.5 hover:bg-raised">
                    <Logo size={26} wordmark={false} />
                    <span className="truncate text-[1.0625rem] font-semibold tracking-tight">
                      {workspace.name}
                    </span>
                  </button>
                }
              >
                {(close) => <WorkspaceMenuItems close={close} />}
              </Menu>
            </div>

            {/* Desktop: search box */}
            <div className="hidden flex-1 md:block">
              <button
                onClick={() => setSearchOpen(true)}
                className="press flex w-64 items-center gap-2 rounded-control bg-raised px-3 py-2 text-sm text-faint hover:text-muted"
              >
                <Search className="size-4" />
                <span className="flex-1 text-left">Search…</span>
                <kbd className="rounded bg-overlay px-1.5 py-0.5 text-[11px] text-faint">
                  ⌘K
                </kbd>
              </button>
            </div>

            {/* Actions */}
            <button
              onClick={() => setQuickAdd({})}
              aria-label="New task"
              className="press flex size-10 items-center justify-center rounded-control text-muted hover:bg-raised hover:text-ink md:hidden"
            >
              <Plus className="size-5" />
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="press flex size-10 items-center justify-center rounded-control text-muted hover:bg-raised hover:text-ink md:hidden"
            >
              <Search className="size-5" />
            </button>

            <button
              onClick={() => setQuickAdd({})}
              className="press hidden h-9 items-center gap-1.5 rounded-control bg-raised px-3 text-sm font-medium text-ink hover:bg-overlay md:flex"
            >
              <Plus className="size-4" />
              New task
              <kbd className="ml-1 rounded bg-overlay px-1.5 py-0.5 text-[11px] text-faint">
                N
              </kbd>
            </button>

            <button
              onClick={() => setMic({})}
              aria-label="Voice capture"
              className="press hidden size-9 items-center justify-center rounded-full bg-accent text-on-accent hover:bg-accent-hover md:flex"
            >
              <Mic className="size-4.5" />
            </button>

            <ThemeToggleButton className="hidden sm:flex" />
            <button
              onClick={() => setNotifOpen(true)}
              aria-label={
                unread > 0 ? `Notifications (${unread} unread)` : "Notifications"
              }
              className="press relative flex size-10 items-center justify-center rounded-control text-muted hover:bg-raised hover:text-ink"
            >
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute right-2 top-2 size-2 rounded-full bg-accent" />
              )}
            </button>

            <Menu
              align="end"
              trigger={
                <button
                  aria-label="Account menu"
                  className="press rounded-full ring-offset-2 hover:opacity-90"
                >
                  <Avatar name={me.name} email={me.email} image={me.image} size={30} />
                </button>
              }
            >
              {(close) => (
                <>
                  <div className="px-2.5 pb-1.5 pt-1">
                    <p className="truncate text-sm font-medium">{me.name ?? me.email}</p>
                    <p className="truncate text-xs text-faint">{me.email}</p>
                  </div>
                  <MenuSeparator />
                  <MenuItem
                    onClick={() => {
                      close();
                      router.push("/account");
                    }}
                  >
                    Account &amp; notifications
                  </MenuItem>
                  <ThemeToggleItem />
                  <MenuSeparator />
                  <SignOutItem />
                </>
              )}
            </Menu>
          </header>

          <OfflineBadge />

          <main className="min-w-0 flex-1">{children}</main>
        </div>

        {/* Mobile bottom bar with centre mic FAB */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur-sm md:hidden">
          <div className="grid h-16 grid-cols-5 items-center px-1 pb-[env(safe-area-inset-bottom)]">
            <TabLink href={base} active={pathname === base} icon={Home} label="My Work" />
            <TabLink
              href={`${base}/projects`}
              active={pathname.startsWith(`${base}/projects`) || pathname.startsWith(`${base}/p/`)}
              icon={FolderKanban}
              label="Projects"
            />
            <div className="flex justify-center">
              <button
                onClick={() => setMic({})}
                aria-label="Voice capture"
                className="press -mt-7 flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5)] hover:bg-accent-hover"
              >
                <Mic className="size-6" />
              </button>
            </div>
            <TabLink
              href={`${base}/dashboard`}
              active={pathname.startsWith(`${base}/dashboard`)}
              icon={ChartNoAxesColumn}
              label="Pulse"
            />
            <button
              onClick={() => setNotifOpen(true)}
              className="press relative flex flex-col items-center gap-1 py-1.5 text-faint"
            >
              <Bell className="size-5" />
              <span className="text-[10px] leading-none">Alerts</span>
              {unread > 0 && (
                <span className="absolute right-[calc(50%-14px)] top-1 size-2 rounded-full bg-accent" />
              )}
            </button>
          </div>
        </nav>

        {/* Overlays */}
        <TaskPanel taskId={taskId} onClose={closeTask} />
        <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
        <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
        {quickAdd && (
          <QuickAddDialog
            defaultProjectId={quickAdd.projectId}
            onClose={() => setQuickAdd(null)}
          />
        )}
        {mic && (
          <VoiceCaptureSheet
            defaultProjectId={mic.projectId}
            onClose={() => setMic(null)}
          />
        )}
        <Celebration />
        <UpgradePrompt />
      </div>
    </UIContext.Provider>
  );
}

function TabLink({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "press flex flex-col items-center gap-1 py-1.5",
        active ? "text-ink" : "text-faint",
      )}
    >
      <Icon className="size-5" />
      <span className="text-[10px] leading-none">{label}</span>
    </Link>
  );
}

function SignOutItem() {
  const [pending, setPending] = useState(false);
  return (
    <MenuItem
      onClick={async () => {
        setPending(true);
        const { signOutAction } = await import("./actions");
        await signOutAction();
      }}
      disabled={pending}
    >
      {pending ? "Signing out…" : "Sign out"}
    </MenuItem>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
