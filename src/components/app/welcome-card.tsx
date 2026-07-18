"use client";

/**
 * Shown once after onboarding (?welcome=1): three moves that make the
 * product click. Dismissable, remembers via localStorage.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Keyboard, Mic, UserPlus, X } from "lucide-react";
import { useWorkspace } from "@/lib/client/workspace";
import { useUI } from "./shell";

export function WelcomeCard() {
  const { workspace } = useWorkspace();
  const { openMic, openQuickAdd } = useUI();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);

  const storageKey = `aw-welcome-${workspace.id}`;

  useEffect(() => {
    // Deferred a tick: localStorage is an external system and the lint rule
    // (rightly) dislikes synchronous setState in effects.
    const id = window.setTimeout(() => {
      if (
        searchParams.get("welcome") === "1" &&
        !localStorage.getItem(storageKey)
      ) {
        setVisible(true);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [searchParams, storageKey]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(storageKey, "1");
    setVisible(false);
  };

  return (
    <div className="animate-fade-up mx-4 mt-4 rounded-card bg-surface p-4 md:mx-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold tracking-tight">
            Welcome to {workspace.name}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Three moves and this place runs itself:
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss welcome"
          className="press rounded-control p-1 text-faint hover:bg-raised hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button
          onClick={() => openMic()}
          className="press flex items-start gap-2.5 rounded-card bg-raised p-3 text-left hover:bg-overlay"
        >
          <Mic className="mt-0.5 size-4 shrink-0 text-accent" />
          <span className="text-sm">
            <span className="font-medium">Hold the mic</span>
            <span className="block text-xs text-muted">
              Talk through a client call; confirm the tasks it heard.
            </span>
          </span>
        </button>
        <button
          onClick={() => openQuickAdd()}
          className="press flex items-start gap-2.5 rounded-card bg-raised p-3 text-left hover:bg-overlay"
        >
          <Keyboard className="mt-0.5 size-4 shrink-0 text-accent" />
          <span className="text-sm">
            <span className="font-medium">Press N</span>
            <span className="block text-xs text-muted">
              “banner for Sable, Thabo, Friday” becomes a task.
            </span>
          </span>
        </button>
        <Link
          href={`/w/${workspace.slug}/settings/members`}
          onClick={dismiss}
          className="press flex items-start gap-2.5 rounded-card bg-raised p-3 text-left hover:bg-overlay"
        >
          <UserPlus className="mt-0.5 size-4 shrink-0 text-accent" />
          <span className="text-sm">
            <span className="font-medium">Invite the team</span>
            <span className="block text-xs text-muted">
              Monday’s briefing writes itself once work lives here.
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
