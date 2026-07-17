"use client";

/**
 * Lines that appear one after another once in view, like someone writing.
 * CSS-driven (opacity/transform only); reduced motion shows everything at
 * once. Give it whole lines, it handles the rhythm.
 */
import { InView } from "./in-view";

export function TypeLines({
  lines,
  startDelay = 0,
  step = 420,
  className,
  lineClassName,
}: {
  lines: string[];
  /** ms before the first line. */
  startDelay?: number;
  /** ms between lines. */
  step?: number;
  className?: string;
  lineClassName?: string;
}) {
  return (
    <InView className={className}>
      {lines.map((line, i) => (
        <p
          key={i}
          className={`anim anim-rise ${lineClassName ?? ""}`}
          style={{ animationDelay: `${startDelay + i * step}ms` }}
        >
          {line}
        </p>
      ))}
    </InView>
  );
}
