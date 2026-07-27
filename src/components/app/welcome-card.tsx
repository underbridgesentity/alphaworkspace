"use client";

/**
 * Shown once on arrival: three moves that make the product click, plus the
 * one permission the whole "it does the following up" promise depends on.
 * Dismissable, remembers via localStorage.
 *
 * Two audiences, not one. The owner arrives from onboarding with ?welcome=1.
 * The teammate they invited arrives with no query string at all and used to
 * land on an empty list, so a membership younger than a day opens the card
 * too; joinedAt gates it, which is why a six-month member never sees it.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bell, Keyboard, LayoutGrid, Mic, UserPlus, X } from "lucide-react";
import { pushStatus, subscribePush, type PushStatus } from "@/lib/client/push";
import { useWorkspace } from "@/lib/client/workspace";
import { useUI } from "./shell";

const FRESH_MEMBER_MS = 24 * 60 * 60 * 1000;

export function WelcomeCard() {
  const { workspace, projects, members, me } = useWorkspace();
  const { openMic, openQuickAdd } = useUI();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [enabled, setEnabled] = useState(false);

  const storageKey = `aw-welcome-${workspace.id}`;
  const joinedAt = members.find((m) => m.id === me.id)?.joinedAt;

  useEffect(() => {
    // Deferred a tick: localStorage and the clock are both external systems,
    // and the lint rule (rightly) dislikes either one during render.
    const id = window.setTimeout(() => {
      const justJoined =
        joinedAt !== undefined &&
        Date.now() - new Date(joinedAt).getTime() < FRESH_MEMBER_MS;
      const invited = searchParams.get("welcome") === "1" || justJoined;
      if (invited && !localStorage.getItem(storageKey)) setVisible(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [searchParams, storageKey, joinedAt]);

  // Only asked once the card is actually on screen, and never as a prompt of
  // its own: reading the status does not surface any browser dialog.
  useEffect(() => {
    if (visible) void pushStatus().then(setPush);
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(storageKey, "1");
    setVisible(false);
  };

  const turnOnNudges = async () => {
    const next = await subscribePush();
    setPush(next);
    setEnabled(next === "subscribed");
  };

  const canInvite = workspace.role !== "member";
  const boardHref =
    projects.length === 1
      ? `/w/${workspace.slug}/p/${projects[0].id}`
      : `/w/${workspace.slug}/projects`;

  return (
    <div className="mx-item mt-item e2 p-item md:mx-group motion-safe:animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-title">Welcome to {workspace.name}</h2>
          <p className="mt-hair text-muted">
            {canInvite
              ? "Three moves and this place runs itself:"
              : "Three moves to find your feet here:"}
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss welcome"
          className="press -mr-1 shrink-0 rounded-control p-1 text-faint hover:bg-raised hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-item grid gap-sibling sm:grid-cols-3">
        <button
          onClick={() => openMic()}
          className="press e1 flex items-start gap-2.5 p-3 text-left hover:bg-overlay"
        >
          <Mic className="mt-0.5 size-4 shrink-0 text-accent-quiet" />
          <span>
            <span className="block font-medium">Hold the mic</span>
            <span className="block text-meta text-muted">
              Talk through a client call; confirm the tasks it heard.
            </span>
          </span>
        </button>

        <button
          onClick={() => openQuickAdd()}
          className="press e1 flex items-start gap-2.5 p-3 text-left hover:bg-overlay"
        >
          <Keyboard className="mt-0.5 size-4 shrink-0 text-accent-quiet" />
          <span>
            <span className="block font-medium">Press N</span>
            <span className="block text-meta text-muted">
              “banner for Sable, Thabo, Friday” becomes a task.
            </span>
          </span>
        </button>

        {canInvite ? (
          <Link
            href={`/w/${workspace.slug}/settings/members`}
            onClick={dismiss}
            className="press e1 flex items-start gap-2.5 p-3 text-left hover:bg-overlay"
          >
            <UserPlus className="mt-0.5 size-4 shrink-0 text-accent-quiet" />
            <span>
              <span className="block font-medium">Invite the team</span>
              <span className="block text-meta text-muted">
                Monday’s briefing writes itself once work lives here.
              </span>
            </span>
          </Link>
        ) : (
          <Link
            href={boardHref}
            onClick={dismiss}
            className="press e1 flex items-start gap-2.5 p-3 text-left hover:bg-overlay"
          >
            <LayoutGrid className="mt-0.5 size-4 shrink-0 text-accent-quiet" />
            <span>
              <span className="block font-medium">See the board</span>
              <span className="block text-meta text-muted">
                Everything the team is on, before anyone asks you.
              </span>
            </span>
          </Link>
        )}
      </div>

      {/* Push is the channel every nudge in the product actually rides on, and
          nothing else in the app ever asks for it, so a workspace could run
          for months with every send silently a no-op. One calm row, never a
          modal, and only where the browser can still be asked. */}
      {push === "unsubscribed" && (
        <button
          onClick={() => void turnOnNudges()}
          className="press mt-sibling flex w-full items-center gap-2.5 rounded-control px-2 py-2.5 text-left hover:bg-raised"
        >
          <Bell className="size-4 shrink-0 text-accent-quiet" />
          <span className="min-w-0 flex-1 text-meta text-muted">
            Turn on nudges so the follow-up reaches you with the app closed.
          </span>
          <span className="shrink-0 text-meta font-medium text-accent-quiet">
            Turn on
          </span>
        </button>
      )}
      {enabled && (
        <p className="mt-sibling px-2 text-meta text-muted">
          Nudges are on. This device will hear about work going quiet.
        </p>
      )}
      {push === "denied" && (
        <p className="mt-sibling px-2 text-meta text-faint">
          Notifications are blocked for this site, so nudges stay in the app
          until you allow them in your browser settings.
        </p>
      )}
    </div>
  );
}
