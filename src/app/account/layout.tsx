import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { AppProviders } from "@/components/providers";

export default function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppProviders>
      <div className="min-h-dvh">
        <header className="flex h-14 items-center gap-3 border-b border-line px-4 md:px-6">
          <Link
            href="/app"
            className="press flex items-center gap-1 rounded-control px-2 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink"
          >
            <ChevronLeft className="size-4" />
            Back
          </Link>
          <div className="flex-1" />
          <Logo size={26} />
        </header>
        <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 md:px-6">
          {children}
        </main>
      </div>
    </AppProviders>
  );
}
