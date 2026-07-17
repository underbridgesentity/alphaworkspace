/* eslint-disable @next/next/no-img-element -- brand SVGs from /public need no
   optimisation pipeline. */
import { cn } from "@/lib/cn";

/**
 * The Alpha mark + wordmark. The mark uses the white icon on a small ink
 * badge so it reads in both themes; the wordmark is text, so it theme-flips
 * for free.
 */
export function Logo({
  size = 24,
  wordmark = true,
  className,
}: {
  size?: number;
  wordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img
        src="/brand/icon-white.svg"
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-full bg-[#0B1215] shrink-0"
      />
      {wordmark && (
        <span className="text-ink leading-none tracking-tight" style={{ fontSize: size * 0.78 }}>
          <span className="font-semibold">Alpha</span>
          <span className="text-muted">Workspace</span>
        </span>
      )}
    </span>
  );
}
