"use client";

/**
 * Operator portal — the business view. Workspaces, plans, usage, MRR/ARR,
 * and comp/change-plan controls. Never shows tenant content (tasks etc.).
 */
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/client/api";
import { formatZar, PLANS, type PlanId } from "@/lib/plans";
import { timeAgo } from "@/lib/dates";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

interface AdminData {
  overview: {
    workspaces: number;
    members: number;
    paidWorkspaces: number;
    mrrZar: number;
    arrZar: number;
    signups30d: number;
    byPlan: Record<string, number>;
  };
  workspaces: {
    id: string;
    name: string;
    slug: string;
    plan: PlanId;
    ownerEmail: string | null;
    members: number;
    captures: number;
    createdAt: string;
    lastActivity: string | null;
  }[];
}

export default function AdminPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["admin"],
    queryFn: () => apiGet<AdminData>("/api/admin"),
  });

  const setPlan = useMutation({
    mutationFn: (vars: { workspaceId: string; plan: PlanId }) =>
      apiMutate("/api/admin", { method: "POST", body: vars }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin"] });
      toast("Plan updated", { variant: "success" });
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Failed", { variant: "error" }),
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const o = data.overview;
  const tiles = [
    { label: "MRR", value: formatZar(o.mrrZar), note: `${formatZar(o.arrZar)} ARR` },
    { label: "Paying", value: String(o.paidWorkspaces), note: `${o.workspaces} workspaces` },
    { label: "People", value: String(o.members), note: "across all teams" },
    { label: "New (30d)", value: String(o.signups30d), note: "workspaces created" },
    { label: "Team", value: String(o.byPlan.team ?? 0), note: "on Team band" },
    { label: "Studio", value: String(o.byPlan.studio ?? 0), note: "on Studio band" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Operator</h1>
        <p className="mt-0.5 text-sm text-muted">
          The business at a glance. Money truth also lives in your PayFast
          merchant dashboard; this is the product side.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-card border border-line bg-surface p-4">
            <p className="text-xs font-medium text-faint">{t.label}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight tabular">{t.value}</p>
            <p className="mt-0.5 text-[11px] text-faint">{t.note}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Workspaces</h2>
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-3 py-2 font-medium">Workspace</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Members</th>
                <th className="px-3 py-2 font-medium">Captures (mo)</th>
                <th className="px-3 py-2 font-medium">Last active</th>
                <th className="px-3 py-2 font-medium">Plan</th>
              </tr>
            </thead>
            <tbody>
              {data.workspaces.map((w) => (
                <tr key={w.id} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{w.name}</p>
                    <p className="text-xs text-faint">/{w.slug}</p>
                  </td>
                  <td className="px-3 py-2.5 text-muted">{w.ownerEmail ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular">{w.members}</td>
                  <td className="px-3 py-2.5 tabular">{w.captures}</td>
                  <td className="px-3 py-2.5 text-muted">
                    {w.lastActivity ? timeAgo(w.lastActivity) : "never"}
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={w.plan}
                      aria-label={`Plan for ${w.name}`}
                      onChange={(e) =>
                        setPlan.mutate({ workspaceId: w.id, plan: e.target.value as PlanId })
                      }
                      className="rounded-control bg-raised px-2 py-1 text-xs outline-none"
                    >
                      {(Object.keys(PLANS) as PlanId[]).map((p) => (
                        <option key={p} value={p}>
                          {PLANS[p].name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-faint">
          Changing a plan here comps it directly (no PayFast charge) — for
          support, trials or refunds handled in PayFast.
        </p>
      </div>
    </div>
  );
}
