"use client";

/**
 * Members & invites. The member cap is a band, not a wall, hitting it
 * offers the next band, never blocks existing people.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Mail, X } from "lucide-react";
import { apiGet, apiMutate, ApiError } from "@/lib/client/api";
import { raiseLimit } from "@/lib/client/tasks";
import { useWorkspace } from "@/lib/client/workspace";
import { timeAgo } from "@/lib/dates";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface InviteRow {
  id: string;
  email: string;
  role: "admin" | "member" | "owner";
  createdAt: string;
  expiresAt: string;
}

export default function MembersSettingsPage() {
  const { workspace, members, me, usage } = useWorkspace();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");

  const invites = useQuery({
    queryKey: ["ws", workspace.slug, "invites"],
    queryFn: () => apiGet<{ invites: InviteRow[] }>(`/api/w/${workspace.slug}/invites`),
    select: (d) => d.invites,
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["ws", workspace.slug, "bootstrap"] }),
      qc.invalidateQueries({ queryKey: ["ws", workspace.slug, "invites"] }),
    ]);
  };

  const sendInvite = useMutation({
    mutationFn: () =>
      apiMutate(`/api/w/${workspace.slug}/invites`, {
        method: "POST",
        body: { email: email.trim(), role },
      }),
    onSuccess: async () => {
      toast(`Invite sent to ${email.trim()}`, { variant: "success" });
      setEmail("");
      await refresh();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "plan_limit") raiseLimit(err);
      else toast(err instanceof Error ? err.message : "Invite failed", { variant: "error" });
    },
  });

  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    try {
      await fn();
      if (okMsg) toast(okMsg, { variant: "success" });
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work", { variant: "error" });
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold">Invite someone</h2>
        <p className="mt-0.5 text-xs text-faint">
          {usage.members} of {usage.limits.maxMembers} seats used on the{" "}
          {workspace.plan} band.
        </p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) sendInvite.mutate();
          }}
        >
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@studio.co.za"
            aria-label="Email to invite"
            className="flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "member" | "admin")}
            aria-label="Role"
            className="h-10 rounded-control bg-raised px-3 text-sm outline-none"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" loading={sendInvite.isPending}>
            <Mail className="size-4" />
            Send invite
          </Button>
        </form>
        <InviteLink />
      </section>

      {(invites.data?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-sm font-semibold">Pending invites</h2>
          <div className="mt-2 space-y-1">
            {invites.data!.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 rounded-card bg-surface px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{inv.email}</span>
                <span className="text-xs text-faint">{inv.role}</span>
                <span className="hidden text-xs text-faint sm:inline">
                  sent {timeAgo(inv.createdAt)}
                </span>
                <button
                  aria-label={`Revoke invite for ${inv.email}`}
                  onClick={() =>
                    void act(
                      () =>
                        apiMutate(`/api/w/${workspace.slug}/invites/${inv.id}`, {
                          method: "DELETE",
                        }),
                      "Invite revoked",
                    )
                  }
                  className="press rounded p-1 text-faint hover:bg-raised hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold">Members</h2>
        <div className="mt-2 space-y-1">
          {members.map((m) => (
            <div
              key={m.membershipId}
              className="flex items-center gap-3 rounded-card bg-surface px-3 py-2.5"
            >
              <Avatar name={m.name} email={m.email} image={m.image} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name ?? m.email}
                  {m.id === me.id && <span className="text-faint"> (you)</span>}
                </p>
                <p className="truncate text-xs text-faint">{m.email}</p>
              </div>
              <span className="hidden text-xs tabular text-faint sm:inline">
                {m.openTasks ?? 0} open
              </span>
              {m.role === "owner" ? (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                  Owner
                </span>
              ) : (
                <select
                  value={m.role}
                  aria-label={`Role for ${m.name ?? m.email}`}
                  onChange={(e) =>
                    void act(
                      () =>
                        apiMutate(
                          `/api/w/${workspace.slug}/members/${m.membershipId}`,
                          { method: "PATCH", body: { role: e.target.value } },
                        ),
                      "Role updated",
                    )
                  }
                  className="h-8 rounded-control bg-raised px-2 text-xs outline-none"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              )}
              {m.role !== "owner" && m.id !== me.id && (
                <button
                  aria-label={`Remove ${m.name ?? m.email}`}
                  onClick={() =>
                    void act(
                      () =>
                        apiMutate(
                          `/api/w/${workspace.slug}/members/${m.membershipId}`,
                          { method: "DELETE" },
                        ),
                      "Member removed",
                    )
                  }
                  className="press rounded p-1 text-faint hover:bg-raised hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">
          Admins manage members, projects and all work. Members create and
          manage work, and always see their own tasks. A client-viewer role
          arrives with shared views.
        </p>
      </section>
    </div>
  );
}

function InviteLink() {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await apiMutate<{ url: string }>(
        `/api/w/${workspace.slug}/invite-link`,
        { method: "POST", body: { role: "member" } },
      );
      if (!("queued" in res && res.queued)) setLink(res.url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't create a link", {
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="mt-3 rounded-card border border-dashed border-line bg-surface/60 p-3">
      {link ? (
        <div className="flex items-center gap-2">
          <Link2 className="size-4 shrink-0 text-faint" />
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 truncate bg-transparent text-sm outline-none"
            aria-label="Shareable invite link"
          />
          <Button size="sm" variant="quiet" onClick={() => void copy()}>
            {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : (
        <button
          onClick={() => void generate()}
          disabled={busy}
          className="press inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink disabled:opacity-50"
        >
          <Link2 className="size-4" />
          {busy ? "Creating…" : "Create a shareable invite link"}
        </button>
      )}
      <p className="mt-1.5 text-xs text-faint">
        Anyone with the link can join as a member. Revoke it any time from
        pending invites.
      </p>
    </div>
  );
}
