"use client";

/**
 * Global error boundary. Errors apologise and offer a way forward —
 * never a stack trace, never a dead end.
 */
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] boundary caught", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        Something broke on our side
      </h1>
      <p className="mt-2 max-w-sm text-muted">
        Sorry about that — it’s been noted. Your work is saved; offline changes
        are still queued. Try again, and if it keeps happening, refresh.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-faint">Reference: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="press mt-6 inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover"
      >
        <RefreshCw className="size-4" />
        Try again
      </button>
    </main>
  );
}
