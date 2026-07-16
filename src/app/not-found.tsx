import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size={28} />
      <p className="mt-10 text-6xl font-semibold tracking-tight text-faint">404</p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">
        This page isn’t here
      </h1>
      <p className="mt-2 max-w-sm text-muted">
        The link may be old, or the thing it pointed at was deleted. Your work
        is safe where you left it.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/app"
          className="press rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover"
        >
          My Work
        </Link>
        <Link
          href="/"
          className="press rounded-control bg-raised px-4 py-2.5 text-sm font-medium hover:bg-overlay"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
