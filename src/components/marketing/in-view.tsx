"use client";

/**
 * Choreography gate: children's CSS animations stay paused until the block
 * scrolls into view (once), then run. Pair with the `.anim` utility, which
 * is `animation-play-state: paused` until an ancestor has [data-inview].
 * Keeps every section's show starting exactly when the audience arrives.
 */
import { useEffect, useRef, type CSSProperties } from "react";

export function InView({
  children,
  className,
  style,
  margin = "-15% 0px",
}: {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  /** rootMargin for the observer; negative pulls the trigger inward. */
  margin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            el.dataset.inview = "";
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: margin, threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
