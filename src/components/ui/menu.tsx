"use client";

/**
 * Lightweight popover menu: trigger + anchored list, closes on outside
 * click/Escape, arrow-key navigation. Enough for switchers and row actions
 * without a positioning library.
 */
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";

export function Menu({
  trigger,
  align = "start",
  children,
  className,
}: {
  trigger: React.ReactElement;
  align?: "start" | "end";
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          setOpen((o) => !o);
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": id,
      })
    : trigger;

  return (
    <div ref={rootRef} className="relative inline-block">
      {triggerEl}
      {open && (
        <div
          id={id}
          role="menu"
          className={cn(
            "absolute z-50 mt-1.5 min-w-48 overflow-hidden rounded-card bg-overlay p-1.5",
            "shadow-[var(--shadow-overlay)] animate-scale-in origin-top",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {typeof children === "function"
            ? children(() => setOpen(false))
            : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  danger = false,
  disabled = false,
  children,
}: {
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm",
        "disabled:opacity-50",
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-ink hover:bg-raised",
      )}
    >
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1.5 h-px bg-line" role="separator" />;
}
