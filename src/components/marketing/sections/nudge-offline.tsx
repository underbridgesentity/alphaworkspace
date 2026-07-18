import { AtSign, Bell, Check, Sparkles, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { InView } from "@/components/marketing/in-view";

/**
 * "Anti-noise by design": two product moments side by side. Card A plays
 * the outbound nudges arriving as calm toasts; card B plays the offline
 * queue reconciling when signal returns. Header and each card sit in their
 * own <InView> so every show starts when it scrolls into the audience.
 */

type Toast = {
  icon: typeof Bell;
  accent?: boolean;
  title: string;
  body: string;
  delay: number;
};

const TOASTS: Toast[] = [
  {
    icon: Bell,
    title: "Naledi assigned you a task",
    body: "Retainer report deck · due Friday",
    delay: 200,
  },
  {
    icon: AtSign,
    title: "Thabo mentioned you",
    body: "“can you sanity-check the Karoo copy?”",
    delay: 700,
  },
  {
    icon: Sparkles,
    accent: true,
    title: "Morning brief",
    body: "Two overdue need a decision, then Friday's deadline.",
    delay: 1200,
  },
];

type QueuedRow = {
  title: string;
  status: "todo" | "doing" | "done";
  delay: number;
};

const QUEUED: QueuedRow[] = [
  { title: "Draft Karoo Coffee status update", status: "todo", delay: 400 },
  { title: "Sable rebrand moodboard", status: "doing", delay: 650 },
  { title: "Karoo Coffee label copy", status: "done", delay: 900 },
];

function StatusDot({ status }: { status: QueuedRow["status"] }) {
  if (status === "done") {
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-accent">
        <Check className="size-2.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "size-3.5 shrink-0 rounded-full border-2",
        status === "doing" ? "border-accent" : "border-line-strong",
      )}
    />
  );
}

export function NudgeOffline() {
  return (
    <section className="relative overflow-hidden">
      <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <InView className="text-center">
          <p className="anim anim-rise text-xs font-semibold uppercase tracking-wider text-faint">
            Anti-noise by design
          </p>
          <h2
            className="anim anim-rise mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ animationDelay: "100ms" }}
          >
            The app does the following up. Not you.
          </h2>
          <p
            className="anim anim-rise mx-auto mt-3 max-w-2xl text-muted"
            style={{ animationDelay: "220ms" }}
          >
            Assignments, mentions, due-today digests and gone-quiet nudges go
            out on their own, batched and calm. Your team's group chat goes back
            to being about lunch.
          </p>
        </InView>

        <div className="mt-10 grid gap-4 sm:gap-5 md:mt-14 md:grid-cols-2">
          <InView className="min-h-80 rounded-card border border-line bg-surface p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
              The nudges
            </h3>
            <div aria-hidden className="mt-4 space-y-3">
              {TOASTS.map((toast) => {
                const Icon = toast.icon;
                return (
                  <div
                    key={toast.title}
                    className="anim anim-slide-r flex items-start gap-3 rounded-control border border-line bg-raised/70 p-3"
                    style={{ animationDelay: `${toast.delay}ms` }}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        toast.accent
                          ? "bg-accent-soft"
                          : "border border-line bg-surface",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4",
                          toast.accent ? "text-accent" : "text-muted",
                        )}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{toast.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{toast.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p
              className="anim anim-rise mt-4 text-xs text-faint"
              style={{ animationDelay: "1700ms" }}
            >
              One batched ping per person per morning. Never a storm.
            </p>
          </InView>

          <InView className="rounded-card border border-line bg-surface p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
              Signal optional
            </h3>
            <div aria-hidden className="mt-4">
              <div
                className="anim anim-rise flex items-center gap-3"
                style={{ animationDelay: "150ms" }}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised">
                  <WifiOff className="size-4 text-muted" />
                </span>
                <p className="text-sm font-medium">Connection dropped</p>
                <span className="ml-auto rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">
                  offline
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {QUEUED.map((row) => (
                  <div
                    key={row.title}
                    className="anim anim-rise flex items-center gap-2.5 rounded-control border border-line bg-raised/70 px-3 py-2.5"
                    style={{ animationDelay: `${row.delay}ms` }}
                  >
                    <StatusDot status={row.status} />
                    <p className="min-w-0 truncate text-sm font-medium">
                      {row.title}
                    </p>
                    <span className="ml-auto shrink-0 rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-faint">
                      queued
                    </span>
                  </div>
                ))}
              </div>
              <div
                className="anim anim-rise relative mt-3 flex h-8 items-center overflow-hidden rounded-control bg-raised px-3 text-xs text-muted"
                style={{ animationDelay: "1400ms" }}
              >
                <span className="relative">Back online · syncing 3 changes</span>
                <span
                  className="anim-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-accent-soft to-transparent"
                  style={{ animationDelay: "1.8s" }}
                />
              </div>
            </div>
            <p
              className="anim anim-rise mt-4 text-xs text-faint"
              style={{ animationDelay: "2100ms" }}
            >
              Reads come from cache. Writes queue. Nothing is lost between here
              and signal.
            </p>
          </InView>
        </div>
      </div>
    </section>
  );
}
