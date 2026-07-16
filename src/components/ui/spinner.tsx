import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      aria-label="Loading"
      className={cn("size-5 animate-spin text-muted", className)}
    />
  );
}
