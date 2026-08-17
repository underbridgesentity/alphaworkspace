import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getUser } from "@/server/session";
import { isOperator } from "@/server/admin/operator";
import { Logo } from "@/components/ui/logo";
import { AppProviders } from "@/components/providers";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (!(await isOperator(user))) redirect("/app");

  return (
    <AppProviders>
      <div className="min-h-dvh">
        {/* The status-bar inset rides on top of the 3.5rem row, the same as
            the app shell's header; zero in a browser tab. */}
        <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 border-b border-line px-4 pt-[env(safe-area-inset-top)] md:px-6">
          <Link
            href="/app"
            className="press flex items-center gap-1 rounded-control px-2 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink"
          >
            <ChevronLeft className="size-4" />
            App
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Logo size={24} wordmark={false} />
            <span className="text-sm font-semibold tracking-tight">
              Operator
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 md:px-6">
          {children}
        </main>
      </div>
    </AppProviders>
  );
}
