"use client";

/**
 * Personal account: profile, notification preferences (per type, per
 * channel), push enablement, and POPIA rights — export and deletion.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Download, Moon, Sun } from "lucide-react";
import { apiGet, apiMutate } from "@/lib/client/api";
import {
  pushStatus,
  subscribePush,
  unsubscribePush,
  type PushStatus,
} from "@/lib/client/push";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/types";
import { defaultChannelsFor } from "@/lib/notification-defaults";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

interface MeData {
  me: {
    id: string;
    name: string | null;
    email: string;
    notificationPrefs: Record<
      string,
      { inapp?: boolean; push?: boolean; email?: boolean }
    >;
  };
}

const TYPE_LABELS: Record<NotificationType, string> = {
  task_assigned: "Task assigned to me",
  task_due_soon: "Due today (daily batch)",
  task_overdue: "Slipped past due (daily batch)",
  comment_added: "Comments on my tasks",
  mentioned: "When someone @mentions me",
  narrative_ready: "Weekly narrative (Monday)",
  morning_brief: "Morning brief push",
};

export default function AccountPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => apiGet<MeData>("/api/me"),
  });

  // Keyed by the server value: state initialises from it on mount and
  // re-initialises if the profile is refetched with a different name.
  const serverName = data?.me.name ?? "";
  const [nameState, setName] = useState<{ base: string; value: string } | null>(null);
  const name = nameState?.base === serverName ? nameState.value : serverName;
  const [push, setPush] = useState<PushStatus>("unsupported");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Deferred a tick — reading external browser state, then setting.
    const id = window.setTimeout(() => {
      void pushStatus().then((s) => {
        if (!cancelled) setPush(s);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);

  const prefs = data?.me.notificationPrefs ?? {};

  const saveName = async () => {
    setBusy("name");
    try {
      await apiMutate("/api/me", { method: "PATCH", body: { name: name.trim() } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast("Saved", { variant: "success" });
    } finally {
      setBusy(null);
    }
  };

  const togglePref = async (
    type: NotificationType,
    channel: "push" | "email",
    value: boolean,
  ) => {
    const next = {
      ...prefs,
      [type]: { ...prefs[type], [channel]: value },
    };
    qc.setQueryData<MeData>(["me", "profile"], (old) =>
      old ? { me: { ...old.me, notificationPrefs: next } } : old,
    );
    try {
      await apiMutate("/api/me", {
        method: "PATCH",
        body: { notificationPrefs: next },
      });
    } catch {
      toast("Couldn't save that preference", { variant: "error" });
      await qc.invalidateQueries({ queryKey: ["me", "profile"] });
    }
  };

  const enablePush = async () => {
    setBusy("push");
    try {
      const status = await subscribePush();
      setPush(status);
      if (status === "subscribed") {
        toast("Push enabled on this device", { variant: "success" });
      } else if (status === "denied") {
        toast("Notifications are blocked in your browser settings", {
          variant: "error",
        });
      } else if (status === "no-key") {
        toast("Push isn't configured on this server yet", { variant: "error" });
      }
    } finally {
      setBusy(null);
    }
  };

  const exportData = () => {
    window.location.href = "/api/me/export";
  };

  const deleteAccount = async () => {
    setBusy("delete");
    try {
      await apiMutate("/api/me", { method: "DELETE" });
      const { signOutAction } = await import("@/components/app/actions");
      await signOutAction();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't delete your account", {
        variant: "error",
      });
      setBusy(null);
    }
  };

  const theme = () =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "light"
      ? "light"
      : "dark";
  const [currentTheme, setCurrentTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const id = window.setTimeout(() => setCurrentTheme(theme()), 0);
    return () => window.clearTimeout(id);
  }, []);
  const setTheme = (t: "dark" | "light") => {
    setCurrentTheme(t);
    if (t === "light") {
      document.documentElement.dataset.theme = "light";
      localStorage.setItem("aw-theme", "light");
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.setItem("aw-theme", "dark");
    }
  };

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Account</h1>
        <p className="mt-0.5 text-sm text-muted">{data?.me.email}</p>
        <div className="mt-4 flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName({ base: serverName, value: e.target.value })}
            placeholder="Your name"
            aria-label="Your name"
            maxLength={120}
            className="max-w-xs"
          />
          <Button
            variant="quiet"
            onClick={() => void saveName()}
            loading={busy === "name"}
            disabled={!name.trim()}
          >
            Save
          </Button>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Appearance</h2>
        <div className="mt-2 flex items-center rounded-full bg-raised p-0.5 text-sm w-fit">
          <button
            onClick={() => setTheme("dark")}
            className={cn(
              "press flex items-center gap-1.5 rounded-full px-3 py-1.5",
              currentTheme === "dark" && "bg-overlay font-medium",
            )}
          >
            <Moon className="size-3.5" /> Dark
          </button>
          <button
            onClick={() => setTheme("light")}
            className={cn(
              "press flex items-center gap-1.5 rounded-full px-3 py-1.5",
              currentTheme === "light" && "bg-overlay font-medium",
            )}
          >
            <Sun className="size-3.5" /> Light
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Notifications</h2>
        <p className="mt-0.5 text-xs text-faint">
          In-app is always on (it’s quiet). Push and email are yours to tune —
          defaults are deliberately conservative.
        </p>

        <div className="mt-3 rounded-card bg-surface p-3">
          <div className="flex items-center gap-2">
            <BellRing className="size-4 text-accent" />
            <p className="flex-1 text-sm">
              {push === "subscribed"
                ? "Push is on for this device"
                : push === "denied"
                  ? "Push is blocked in browser settings"
                  : push === "unsupported"
                    ? "This browser doesn't support push"
                    : "Enable push on this device"}
            </p>
            {push === "subscribed" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void unsubscribePush().then(setPush)}
              >
                Disable
              </Button>
            ) : (
              (push === "unsubscribed" || push === "no-key") && (
                <Button
                  size="sm"
                  variant="quiet"
                  loading={busy === "push"}
                  onClick={() => void enablePush()}
                >
                  Enable
                </Button>
              )
            )}
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-faint">
                <th className="py-2 font-medium">When</th>
                <th className="w-16 py-2 text-center font-medium">Push</th>
                <th className="w-16 py-2 text-center font-medium">Email</th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_TYPES.map((type) => {
                const defaults = defaultChannelsFor(type);
                const p = prefs[type] ?? {};
                return (
                  <tr key={type} className="border-t border-line">
                    <td className="py-2.5 pr-3">{TYPE_LABELS[type]}</td>
                    {(["push", "email"] as const).map((channel) => (
                      <td key={channel} className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`${TYPE_LABELS[type]} via ${channel}`}
                          checked={p[channel] ?? defaults[channel]}
                          onChange={(e) =>
                            void togglePref(type, channel, e.target.checked)
                          }
                          className="size-4 accent-[var(--accent)]"
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Your data (POPIA)</h2>
        <p className="mt-0.5 text-xs text-faint">
          Your data is yours. Take a copy, or take it all away.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="quiet" size="sm" onClick={exportData}>
            <Download className="size-4" />
            Export my data (JSON)
          </Button>
        </div>

        <div className="mt-6 rounded-card border border-danger/25 p-4">
          <h3 className="text-sm font-semibold text-danger">Delete my account</h3>
          <p className="mt-1 text-sm text-muted">
            Permanent. Workspaces you solely own (with no other members) are
            deleted too. If a workspace still has people in it, hand over
            ownership first.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={`Type “${data?.me.email ?? "your email"}” to confirm`}
              aria-label="Confirm your email"
            />
            <Button
              variant="danger"
              disabled={!data || confirmEmail !== data.me.email}
              loading={busy === "delete"}
              onClick={() => void deleteAccount()}
            >
              Delete forever
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
