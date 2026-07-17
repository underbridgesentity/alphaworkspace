import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = { title: "Offline" };

/**
 * Navigation fallback when a page isn't cached yet. Reached rarely, boards
 * and My Work you've opened before keep working offline.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size={34} />
      <WifiOff className="mt-10 size-8 text-faint" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        You’re offline
      </h1>
      <p className="mt-2 max-w-sm text-muted">
        This page isn’t cached yet. Screens you’ve opened before. My Work,
        your boards, still work offline, and anything you change syncs the
        moment you’re back.
      </p>
      <Link
        href="/app"
        className="press mt-6 rounded-control bg-raised px-4 py-2.5 text-sm font-medium hover:bg-overlay"
      >
        Open My Work
      </Link>
    </main>
  );
}
