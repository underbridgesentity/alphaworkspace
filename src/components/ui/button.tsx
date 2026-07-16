import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "quiet" | "outline" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent hover:bg-accent-hover font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
  quiet: "bg-raised text-ink hover:bg-overlay",
  outline: "border border-line-strong text-ink hover:bg-raised",
  danger: "bg-danger/10 text-danger hover:bg-danger/20 font-medium",
  ghost: "text-muted hover:text-ink hover:bg-raised",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-control",
  md: "h-10 px-4 rounded-control",
  lg: "h-12 px-5 text-[1.0625rem] rounded-[0.625rem]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        "press inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
        "disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
