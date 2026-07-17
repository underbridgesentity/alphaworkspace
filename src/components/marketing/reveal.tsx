"use client";

/**
 * Scroll-appearance wrapper: fades/rises children in when they enter the
 * viewport (once). Stagger siblings with `delay`. prefers-reduced-motion is
 * handled in CSS — content is always visible there.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Reveal when entering the viewport — or instantly if the user is
          // already past it (anchor jumps, restored scroll positions).
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            setVisible(true);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    io.observe(el);
    // Safety net: whatever a browser does to the observer (degenerate
    // viewports, ancient engines), content must never stay hidden.
    const fallback = window.setTimeout(() => setVisible(true), 2500);
    return () => {
      io.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", visible && "is-visible", className)}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
