"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { pendingCount } from "@/lib/client/outbox";

/**
 * Quiet connectivity strip. Offline isn't an error state in Alpha — it's a
 * normal taxi ride; the copy says so.
 */
export function OfflineBadge() {
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const update = () => {
      setOffline(!navigator.onLine);
      void pendingCount().then(setPending);
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const interval = window.setInterval(update, 5000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.clearInterval(interval);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="flex items-center gap-2 bg-warn/10 px-4 py-2 text-sm text-warn md:px-6">
      <WifiOff className="size-4 shrink-0" />
      <span>
        Offline — keep working, everything syncs when you’re back
        {pending > 0 && (
          <span className="text-warn/80">
            {" "}
            · {pending} change{pending === 1 ? "" : "s"} waiting
          </span>
        )}
      </span>
    </div>
  );
}
