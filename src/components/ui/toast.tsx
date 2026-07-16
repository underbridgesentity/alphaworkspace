"use client";

/**
 * Minimal toast system — bottom-anchored (thumb zone), quiet by default.
 * Errors apologise and offer a way forward; that copy comes from callers.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";

export interface Toast {
  id: number;
  message: string;
  variant: "default" | "success" | "error";
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  toast: (
    message: string,
    opts?: { variant?: Toast["variant"]; action?: Toast["action"] },
  ) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback<ToastApi["toast"]>(
    (message, opts) => {
      const id = nextId.current++;
      setToasts((t) => [
        ...t.slice(-2),
        { id, message, variant: opts?.variant ?? "default", action: opts?.action },
      ]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-3 rounded-card bg-overlay px-4 py-3 text-sm animate-fade-up",
              "shadow-[var(--shadow-overlay)]",
              t.variant === "error" && "text-danger",
              t.variant === "success" && "text-ok",
            )}
          >
            <span className={cn(t.variant === "default" && "text-ink")}>
              {t.message}
            </span>
            {t.action && (
              <button
                className="press shrink-0 font-semibold text-accent hover:text-accent-hover"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
