import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const base =
  "w-full rounded-control bg-raised px-3.5 text-ink placeholder:text-faint " +
  "border border-transparent focus:border-line-strong focus:outline-none " +
  "focus:ring-2 focus:ring-accent/40 transition-shadow";

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, "h-10", className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(base, "py-2.5 min-h-24 resize-y", className)} {...rest} />
  );
}
