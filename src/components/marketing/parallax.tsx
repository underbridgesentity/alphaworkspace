"use client";

/**
 * Scroll-linked drift: the element translates against scroll by `speed` ×
 * its distance from the viewport centre. Transform-only (stays composited,
 * cheap on low-end phones), one passive listener + rAF per instance, and it
 * sits still under prefers-reduced-motion.
 */
import { useEffect, useRef } from "react";

export function Parallax({
  speed = 0.08,
  className,
  children,
}: {
  /** Positive drifts with scroll (lags), negative drifts against it. */
  speed?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const fromCentre =
        r.top + r.height / 2 - window.innerHeight / 2 - currentOffset;
      const next = Math.round(fromCentre * speed * 10) / 10;
      if (next !== currentOffset) {
        currentOffset = next;
        el.style.transform = `translate3d(0, ${next}px, 0)`;
      }
    };
    let currentOffset = 0;
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = "";
    };
  }, [speed]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
