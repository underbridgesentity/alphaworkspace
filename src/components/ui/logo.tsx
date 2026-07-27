import { cn } from "@/lib/cn";

/** Three intentional steps, not nine independent decisions. */
const SIZES = { sm: 26, md: 32, lg: 40 } as const;
type LogoSize = keyof typeof SIZES;

/**
 * The mark is a filled disc with the "A" knocked OUT of it, so the disc is
 * what carries colour and the glyph is whatever shows through. Painting the
 * asset as a mask instead of drawing it as an image is what lets a token do
 * the theme flip: ink disc on frost paper, frost disc on midnight, glyph
 * always the surface it sits on. The old hardcoded #0B1215 plate could not
 * flip, so the white disc went invisible against the light sidebar (which is
 * pure white) and the glyph stayed page-coloured in the dark.
 * rounded-full is the graceful degradation: a browser without mask support
 * paints a plain ink disc rather than a square.
 */
const MARK: React.CSSProperties = {
  maskImage: "url(/brand/icon-white.svg)",
  WebkitMaskImage: "url(/brand/icon-white.svg)",
  maskSize: "100% 100%",
  WebkitMaskSize: "100% 100%",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
};

/** Wordmark rides the type scale rather than a fraction of the mark size. */
const WORDMARK: Record<LogoSize, string> = {
  sm: "text-body",
  md: "text-lede",
  lg: "text-title",
};

/**
 * Numbers still resolve, because six call sites outside this pass ask for
 * 24/26/28/32/34. They snap to the nearest named step, so the seven accidental
 * sizes collapse to three today instead of after a sweep of every layout.
 */
function snap(px: number): LogoSize {
  const names = Object.keys(SIZES) as LogoSize[];
  return names.reduce((best, name) =>
    Math.abs(SIZES[name] - px) < Math.abs(SIZES[best] - px) ? name : best,
  );
}

export function Logo({
  size = "md",
  wordmark = true,
  className,
}: {
  size?: LogoSize | number;
  wordmark?: boolean;
  className?: string;
}) {
  const step = typeof size === "number" ? snap(size) : size;
  const px = SIZES[step];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        style={{ ...MARK, width: px, height: px }}
        className="block shrink-0 rounded-full bg-ink"
      />
      {/* nowrap: the space between the two words is a real break opportunity,
          so a narrow nav on a 360px phone would otherwise stack "Alpha" over
          "Workspace" and double the header height. */}
      {wordmark && (
        <span className={cn("leading-none whitespace-nowrap text-ink", WORDMARK[step])}>
          <span className="font-bold">Alpha</span>{" "}
          <span className="font-normal text-muted">Workspace</span>
        </span>
      )}
    </span>
  );
}
