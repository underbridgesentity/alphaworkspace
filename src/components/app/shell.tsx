"use client";

/**
 * The app chrome: sidebar (desktop), top bar, bottom tab bar with the centre
 * create FAB (mobile, thumb-reachable, per the product spec), and the global
 * overlays (task panel, search, quick-add, voice capture, notifications).
 *
 * Both bars use the frost fade rather than backdrop-blur: a static gradient
 * scrim costs nothing per frame, where a live backdrop-filter over a scrolling
 * list re-samples the layer beneath it on every one.
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
import { normalizeSharedText, SHARE_PARAM } from "@/lib/shell";
import { onSharedText } from "@/lib/client/share-intake";
import { useWorkspace } from "@/lib/client/workspace";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Logo } from "@/components/ui/logo";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { ThemeToggleItem, ThemeToggleButton } from "@/components/ui/theme-toggle";
import { TimerChip } from "@/components/app/timer";
import dynamic from "next/dynamic";
import { Sidebar, WorkspaceMenuItems } from "./sidebar";

// Every overlay is code-split, they only load when summoned, keeping the app
// shell inside the 3G budget. The task panel, search and notifications were
// static until now, which put 18.7 KB gz of never-rendered markup in the
// critical path of every workspace route.
const TaskPanel = dynamic(
  () => import("./task-panel").then((m) => m.TaskPanel),
  { ssr: false },
);
const SearchPalette = dynamic(
  () => import("./search-palette").then((m) => m.SearchPalette),
  { ssr: false },
);
const NotificationsPanel = dynamic(
  () => import("./notifications-panel").then((m) => m.NotificationsPanel),
  { ssr: false },
);
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
import { UpdatePrompt } from "./update-prompt";
import { UpgradePrompt } from "./upgrade-prompt";

interface UIState {
  openTask: (id: string) => void;
  closeTask: () => void;
  openSearch: () => void;
  openQuickAdd: (projectId?: string, text?: string) => void;
  openMic: (projectId?: string) => void;
  openNotifications: () => void;
}

const UIContext = createContext<UIState | null>(null);

export function useUI(): UIState {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI outside AppShell");
  return ctx;
}

/**
 * True from the first time `open` goes true, and true from then on. The
 * overlays are dynamic(), so they must not render before their first summon
 * or the chunk lands in the first paint anyway; but once mounted they stay
 * mounted, because <Dialog> owns the close transition and focus restore, and
 * unmounting an open native <dialog> drops keyboard focus to the body.
 */
function useSummoned(open: boolean): boolean {
  const [summoned, setSummoned] = useState(false);
  if (open && !summoned) setSummoned(true);
  return summoned;
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { workspace, me, unread, isOperator } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const taskId = searchParams.get("task");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{
    projectId?: string;
    text?: string;
  } | null>(null);
  const [mic, setMic] = useState<{ projectId?: string } | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);

  // A ?task= deep link counts as a summon, so the panel still opens on load.
  const taskSummoned = useSummoned(!!taskId);
  const searchSummoned = useSummoned(searchOpen);
  const notifSummoned = useSummoned(notifOpen);

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

  /* ---------------------------- share target ---------------------------- */

  // Text shared from another app while this one is already open. The native
  // layer emits it; on the web nothing ever fires this.
  useEffect(() => onSharedText((text) => setQuickAdd({ text })), []);

  // The cold entry point: /app?share=<text> redirected here. Read once, then
  // dropped from the URL, because the text is somebody's private message and
  // has no business sitting in history or surviving a refresh.
  // Deferred a tick, the codebase's convention for an effect that reads and
  // then sets: the URL rewrite and the open have to happen in that order.
  const shared = searchParams.get(SHARE_PARAM);
  useEffect(() => {
    const text = normalizeSharedText(shared);
    if (!text) return;
    const id = window.setTimeout(() => {
      setQuickAdd({ text });
      const params = new URLSearchParams(searchParams);
      params.delete(SHARE_PARAM);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 0);
    return () => window.clearTimeout(id);
  }, [shared, searchParams, pathname, router]);

  const ui: UIState = {
    openTask,
    closeTask,
    openSearch: () => setSearchOpen(true),
    openQuickAdd: (projectId, text) => setQuickAdd({ projectId, text }),
    openMic: (projectId) => setMic({ projectId }),
    openNotifications: () => setNotifOpen(true),
  };

  const base = `/w/${workspace.slug}`;

  return (
    <UIContext.Provider value={ui}>
      <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-overlay focus:px-3 focus:py-2 focus:shadow-e3"
        >
          Skip to content
        </a>
        <Sidebar className="hidden md:flex" />

        {/* The bottom padding tracks the tab bar's real height, which grows by
            the home-indicator inset, so the last row of a list is never parked
            underneath it. */}
        <div className="flex min-h-dvh min-w-0 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          {/* Top bar. frost-edge-b lays a 14px scrim below the bar so scrolling
              content dissolves into it. The old bg-bg/90 + backdrop-blur-sm
              re-sampled the whole scroller every frame, which is the single
              worst thing you can leave running on a budget Android.

              The height carries the status-bar inset ON TOP of the 3.5rem row
              rather than as padding inside it, so the icons keep their full
              touch target instead of being squeezed. Zero in a normal browser
              tab; non-zero in the installed PWA and on a notched phone, both of
              which draw under the status bar (viewport-fit=cover plus
              black-translucent). */}
          <header className="frost-edge-b sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-1.5 px-3 pt-[env(safe-area-inset-top)] sm:px-4 md:px-6">
            {/* Mobile: workspace name/menu */}
            <div className="min-w-0 flex-1 md:hidden">
              <Menu
                align="start"
                trigger={
                  <button className="press flex max-w-full items-center gap-2 rounded-control px-1.5 py-1.5 hover:bg-raised">
                    <Logo size="md" wordmark={false} />
                    <span className="truncate text-lede font-semibold">
                      {workspace.name}
                    </span>
                  </button>
                }
              >
                {(close) => <WorkspaceMenuItems close={close} nav />}
              </Menu>
            </div>

            {/* Desktop: search box */}
            <div className="hidden flex-1 md:block">
              <button
                onClick={() => setSearchOpen(true)}
                className="press flex w-64 items-center gap-2 rounded-control bg-raised px-3 py-2 text-body text-faint hover:text-muted"
              >
                <Search className="size-4" />
                <span className="flex-1 text-left">Search…</span>
                <kbd className="rounded-chip bg-overlay px-1.5 py-0.5 text-micro text-faint">
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
              className="press hidden h-9 items-center gap-1.5 rounded-control bg-raised px-3 text-body font-medium text-ink hover:bg-overlay md:flex"
            >
              <Plus className="size-4" />
              New task
              <kbd className="ml-1 rounded-chip bg-overlay px-1.5 py-0.5 text-micro text-faint">
                N
              </kbd>
            </button>

            {/* One filled accent per viewport. On mobile that is the create
                FAB, so the desktop mic wears the quiet teal instead, matching
                the project-header mic. */}
            <button
              onClick={() => setMic({})}
              aria-label="Voice capture"
              className="press hidden size-9 items-center justify-center rounded-full bg-raised text-accent-quiet hover:bg-accent-soft md:flex"
            >
              <Mic className="size-4.5" />
            </button>

            <TimerChip />
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
                    <p className="truncate text-body font-medium">{me.name ?? me.email}</p>
                    <p className="truncate text-meta text-faint">{me.email}</p>
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
                  {isOperator && (
                    <MenuItem
                      onClick={() => {
                        close();
                        router.push("/admin");
                      }}
                    >
                      Operator portal
                    </MenuItem>
                  )}
                  <ThemeToggleItem />
                  <MenuSeparator />
                  <SignOutItem />
                </>
              )}
            </Menu>
          </header>

          <OfflineBadge />

          <main id="main" tabIndex={-1} className="min-w-0 flex-1">
            {children}
          </main>
        </div>

        {/* Mobile bottom bar with centre "+" FAB that opens a create menu.
            frost-edge-t is the same dissolve as the header, mirrored upward,
            and it replaces a second live backdrop-filter that sat over the
            scroller for the whole session. */}
        <nav className="frost-edge-t fixed inset-x-0 bottom-0 z-30 md:hidden">
          {/* The left/right insets matter in landscape on a notched phone,
              where the cutout eats into the row and would clip the outer two
              tabs' labels. max() rather than px-1 alongside it, so the normal
              0.25rem is the floor and nothing depends on which utility
              Tailwind happens to emit last. */}
          <div className="grid h-16 grid-cols-5 items-center pb-[env(safe-area-inset-bottom)] pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))]">
            <TabLink href={base} active={pathname === base} icon={Home} label="My Work" />
            <TabLink
              href={`${base}/projects`}
              active={pathname.startsWith(`${base}/projects`) || pathname.startsWith(`${base}/p/`)}
              icon={FolderKanban}
              label="Projects"
            />
            <div className="flex justify-center">
              <button
                onClick={() => setPlusOpen(true)}
                aria-label="Create"
                aria-haspopup="menu"
                aria-expanded={plusOpen}
                className={cn(
                  // relative so the FAB paints above the bar's scrim
                  // pseudo-element, which occupies the 14px it overhangs into.
                  "press relative -mt-7 flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-e3 transition-transform hover:bg-accent-hover",
                  plusOpen && "rotate-45",
                )}
              >
                <Plus className="size-6" />
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
              <span className="text-micro leading-none">Alerts</span>
              {unread > 0 && (
                <span className="absolute right-[calc(50%-14px)] top-1 size-2 rounded-full bg-accent" />
              )}
            </button>
          </div>
        </nav>

        {/* Overlays. Each mounts on first summon and stays mounted after. */}
        {taskSummoned && <TaskPanel taskId={taskId} onClose={closeTask} />}
        {searchSummoned && (
          <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
        )}
        {notifSummoned && (
          <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
        )}
        {quickAdd && (
          <QuickAddDialog
            defaultProjectId={quickAdd.projectId}
            initialText={quickAdd.text}
            onClose={() => setQuickAdd(null)}
          />
        )}
        {mic && (
          <VoiceCaptureSheet
            defaultProjectId={mic.projectId}
            onClose={() => setMic(null)}
          />
        )}

        {/* The "+" create menu: a calm bottom sheet, thumb-reachable, two ways
            to add. Built to still feel right once this is a native app. */}
        <Dialog
          open={plusOpen}
          onClose={() => setPlusOpen(false)}
          ariaLabel="Create"
          variant="center"
        >
          <div className="p-2">
            <p className="px-3 pb-1 pt-2 section-head">
              Create
            </p>
            <button
              onClick={() => {
                setPlusOpen(false);
                setQuickAdd({});
              }}
              className="press flex w-full items-center gap-3 rounded-control px-3 py-3 text-left hover:bg-raised"
            >
              {/* Quiet badges: the teal FAB the user just pressed is still the
                  one saturated thing on the screen behind this sheet. */}
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-muted">
                <Plus className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-medium">Quick add</span>
                <span className="block text-dense text-muted">
                  A new task or project, typed
                </span>
              </span>
            </button>
            <button
              onClick={() => {
                setPlusOpen(false);
                setMic({});
              }}
              className="press flex w-full items-center gap-3 rounded-control px-3 py-3 text-left hover:bg-raised"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-muted">
                <Mic className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-medium">Voice capture</span>
                <span className="block text-dense text-muted">
                  Speak, we sort it into tasks
                </span>
              </span>
            </button>
          </div>
        </Dialog>

        <Celebration />
        <UpdatePrompt />
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "press flex flex-col items-center gap-1 py-1.5",
        active ? "text-ink" : "text-faint",
      )}
    >
      <Icon className="size-5" />
      <span className="text-micro leading-none">{label}</span>
    </Link>
  );
}

function SignOutItem() {
  const [pending, setPending] = useState(false);
  return (
    <MenuItem
      onClick={async () => {
        setPending(true);
        const [{ signOutAction }, { purgeLocalData }] = await Promise.all([
          import("./actions"),
          import("@/lib/client/purge"),
        ]);
        await purgeLocalData(); // shared devices: no workspace data left behind
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
