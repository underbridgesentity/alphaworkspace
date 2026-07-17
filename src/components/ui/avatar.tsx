/* eslint-disable @next/next/no-img-element -- avatars are tiny, remote, and
   already optimised; next/image would add loader weight for nothing. */
import { cn } from "@/lib/cn";

const palette = [
  "#5B7C99", "#6FAE87", "#D9A13B", "#7A9BD1", "#B48EAD", "#66757C",
];

function initials(name: string | null, email?: string): string {
  const source = name?.trim() || email || "?";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function Avatar({
  name,
  email,
  image,
  size = 24,
  className,
}: {
  name: string | null;
  email?: string;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt={name ?? email ?? "avatar"}
        width={size}
        height={size}
        className={cn("rounded-full object-cover shrink-0", className)}
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }
  const key = email ?? name ?? "?";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.4),
        background: colorFor(key),
      }}
      title={name ?? email}
    >
      {initials(name, email)}
    </span>
  );
}
