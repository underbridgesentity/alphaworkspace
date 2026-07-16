"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { flushOutbox } from "@/lib/client/outbox";
import { ToastProvider, useToast } from "@/components/ui/toast";

/**
 * Client providers for the app surface: React Query (reads cache), outbox
 * replay triggers (online / focus / SW ping), service worker registration.
 */

function OutboxFlusher() {
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const flush = async () => {
      const result = await flushOutbox();
      if (cancelled) return;
      if (result.sent > 0) {
        toast(
          result.sent === 1
            ? "Synced 1 offline change"
            : `Synced ${result.sent} offline changes`,
          { variant: "success" },
        );
      }
    };

    void flush();
    const onOnline = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    const onSwMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "flush-outbox") void flush();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [toast]);

  return null;
}

function SwRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support degrades gracefully; the app still works online.
      });
    }
  }, []);
  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 24 * 60 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <OutboxFlusher />
        <SwRegistrar />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
