"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/client/workspace";

const TABS = [
  { href: "", label: "General" },
  { href: "/members", label: "Members" },
  { href: "/billing", label: "Billing" },
];

export default function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { workspace } = useWorkspace();
  const pathname = usePathname();
  const base = `/w/${workspace.slug}/settings`;

  if (workspace.role === "member") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-16 text-center md:px-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Workspace settings
        </h1>
        <p className="mt-2 text-sm text-muted">
          Settings live with admins — ask one of yours if something needs
          changing. Your personal preferences are under{" "}
          <Link href="/account" className="text-accent hover:text-accent-hover">
            Account
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-5 md:px-6 md:pt-7">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <div className="mt-4 flex gap-1 border-b border-line">
        {TABS.map((t) => {
          const href = `${base}${t.href}`;
          const active = pathname === href;
          return (
            <Link
              key={t.href}
              href={href}
              className={cn(
                "press -mb-px border-b-2 px-3 py-2 text-sm",
                active
                  ? "border-accent font-medium text-ink"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <div className="pt-5">{children}</div>
    </div>
  );
}
