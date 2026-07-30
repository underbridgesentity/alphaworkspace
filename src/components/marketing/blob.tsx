/**
 * Liquid decor: a slowly morphing, drifting organic shape in a frost tint.
 * Pure CSS (zero asset weight), theme-adaptive via --ink, aria-hidden.
 * Parent sections should be `relative overflow-hidden`.
 */
import { cn } from "@/lib/cn";
import type { CSSProperties } from "react";

export function Blob({
  className,
  style,
  morph = 18,
  drift = 34,
  strength = 0.08,
}: {
  className?: string;
  style?: CSSProperties;
  /** Seconds per morph / drift cycle. */
  morph?: number;
  drift?: number;
  /** Peak tint opacity (0–1). Keep whisper-quiet. */
  strength?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute", className)}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, var(--accent) ${Math.round(
          strength * 100,
        )}%, transparent), color-mix(in oklab, var(--accent) ${Math.round(
          strength * 25,
        )}%, transparent) 60%, transparent)`,
        // Static blob shape as the resting state: without it, any context
        // where the morph animation is not running (screenshot tooling,
        // animation-cancelling extensions) leaves a hard-edged RECTANGLE of
        // tint. The keyframes then morph from this same shape.
        borderRadius: "58% 42% 55% 45% / 52% 58% 42% 48%",
        // Softness comes from the gradient fade, deliberately no filter:
        // blur + the border-radius morph would re-rasterize every frame.
        animation: `blob-morph ${morph}s ease-in-out infinite, blob-drift ${drift}s ease-in-out infinite`,
        ...style,
      }}
    />
  );
}
