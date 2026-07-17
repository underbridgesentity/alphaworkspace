"use client";

/**
 * Markdown-lite renderer for task descriptions and comments, deliberately
 * tiny (no wiki, per the product laws). Renders **bold**, *italic*, `code`,
 * `- [ ] / - [x]` checklists (tappable in descriptions), bare URLs as links,
 * and @mentions as chips. Everything is escaped first; no raw HTML.
 */
import { Fragment } from "react";
import { cn } from "@/lib/cn";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;
const MENTION_RE = /(^|[\s(])@([\p{L}][\p{L}\p{N}._-]*(?:\s[\p{L}][\p{L}\p{N}._-]*)?)/gu;

function inline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on URLs first, then apply emphasis/mentions to the plain runs.
  const parts = text.split(URL_RE);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      nodes.push(
        <a
          key={`${keyBase}-u${i}`}
          href={part}
          target="_blank"
          rel="noreferrer noopener"
          className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          {part.replace(/^https?:\/\//, "")}
        </a>,
      );
      return;
    }
    nodes.push(...emphasize(part, `${keyBase}-t${i}`));
  });
  return nodes;
}

function emphasize(text: string, keyBase: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith("**") && tok.endsWith("**"))
      return <strong key={`${keyBase}-${i}`}>{withMentions(tok.slice(2, -2), `${keyBase}-b${i}`)}</strong>;
    if (tok.startsWith("`") && tok.endsWith("`"))
      return (
        <code key={`${keyBase}-${i}`} className="rounded bg-raised px-1 py-0.5 text-[0.85em]">
          {tok.slice(1, -1)}
        </code>
      );
    if (tok.startsWith("*") && tok.endsWith("*") && tok.length > 2)
      return <em key={`${keyBase}-${i}`}>{tok.slice(1, -1)}</em>;
    return <Fragment key={`${keyBase}-${i}`}>{withMentions(tok, `${keyBase}-m${i}`)}</Fragment>;
  });
}

function withMentions(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  let idx = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    out.push(text.slice(last, m.index + m[1].length));
    out.push(
      <span
        key={`${keyBase}-${idx++}`}
        className="rounded bg-accent-soft px-1 font-medium text-ink"
      >
        @{m[2]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

export function RichText({
  text,
  className,
  onToggleCheck,
}: {
  text: string;
  className?: string;
  /** When provided, checkboxes are interactive and report the toggled line. */
  onToggleCheck?: (lineIndex: number, checked: boolean) => void;
}) {
  const lines = text.split("\n");
  return (
    <div className={cn("space-y-1 whitespace-pre-wrap break-words", className)}>
      {lines.map((line, i) => {
        const check = line.match(/^(\s*)- \[( |x|X)\]\s(.*)$/);
        if (check) {
          const checked = check[2].toLowerCase() === "x";
          return (
            <label
              key={i}
              className={cn(
                "flex items-start gap-2",
                onToggleCheck ? "cursor-pointer" : "cursor-default",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!onToggleCheck}
                onChange={(e) => onToggleCheck?.(i, e.target.checked)}
                className="mt-1 size-3.5 accent-[var(--accent)]"
              />
              <span className={cn(checked && "text-faint line-through")}>
                {inline(check[3], `l${i}`)}
              </span>
            </label>
          );
        }
        const bullet = line.match(/^(\s*)[-*]\s(.*)$/);
        if (bullet) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-faint">•</span>
              <span>{inline(bullet[2], `l${i}`)}</span>
            </div>
          );
        }
        return <div key={i}>{line ? inline(line, `l${i}`) : <br />}</div>;
      })}
    </div>
  );
}
