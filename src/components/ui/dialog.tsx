"use client";

/**
 * Native <dialog>-based modal — free focus trap, Escape handling and inert
 * background. Variants: centered card, right slide-over (task panel), and
 * bottom sheet on mobile.
 */
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onClose,
  variant = "center",
  ariaLabel,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  variant?: "center" | "panel" | "sheet";
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === el) onClose(); // backdrop click
    };
    el.addEventListener("cancel", onCancel);
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("cancel", onCancel);
      el.removeEventListener("click", onClick);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-label={ariaLabel}
      className={cn(
        "bg-transparent p-0 text-ink backdrop:bg-black/55 backdrop:backdrop-blur-[2px]",
        // reset UA centering; we position per variant
        "fixed inset-0 m-0 h-full max-h-none w-full max-w-none",
      )}
    >
      {variant === "center" && (
        <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-6">
          <div
            className={cn(
              "w-full rounded-t-card bg-overlay shadow-[var(--shadow-overlay)] animate-fade-up",
              "sm:max-w-lg sm:rounded-card sm:animate-scale-in",
              className,
            )}
          >
            {children}
          </div>
        </div>
      )}
      {variant === "panel" && (
        <div className="flex min-h-full justify-end">
          <div
            className={cn(
              "flex h-dvh w-full flex-col bg-surface shadow-[var(--shadow-overlay)] animate-slide-panel",
              "sm:max-w-xl sm:border-l sm:border-line",
              className,
            )}
          >
            {children}
          </div>
        </div>
      )}
      {variant === "sheet" && (
        <div className="flex min-h-full items-end justify-center">
          <div
            className={cn(
              "max-h-[92dvh] w-full overflow-y-auto rounded-t-card bg-overlay shadow-[var(--shadow-overlay)] animate-fade-up sm:max-w-lg",
              className,
            )}
          >
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}

export function DialogHeader({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-5 pt-4 pb-3">
      <h2 className="flex-1 truncate text-[1.0625rem] font-semibold tracking-tight">
        {title}
      </h2>
      {children}
      <button
        onClick={onClose}
        aria-label="Close"
        className="press -mr-1.5 rounded-control p-1.5 text-muted hover:bg-raised hover:text-ink"
      >
        <X className="size-4.5" />
      </button>
    </div>
  );
}
