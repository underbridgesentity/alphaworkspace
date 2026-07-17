"use client";

/**
 * Comment composer with @mention autocomplete. Typing "@" opens a member
 * list; picking one inserts "@Name ". Enter (no shift) sends.
 */
import { useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useWorkspace } from "@/lib/client/workspace";

export function MentionInput({ onSend }: { onSend: (body: string) => void }) {
  const { members } = useWorkspace();
  const [body, setBody] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return members
      .filter(
        (m) =>
          (m.name ?? m.email).toLowerCase().includes(q) ||
          m.email.toLowerCase().startsWith(q),
      )
      .slice(0, 6);
  }, [query, members]);

  const onChange = (value: string) => {
    setBody(value);
    const caret = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\p{L}\p{N}._-]*)$/u);
    setQuery(m ? m[1] : null);
    setActive(0);
  };

  const pick = (member: (typeof members)[number]) => {
    const caret = ref.current?.selectionStart ?? body.length;
    const before = body.slice(0, caret);
    const after = body.slice(caret);
    const replaced = before.replace(/@([\p{L}\p{N}._-]*)$/u, `@${member.name ?? member.email.split("@")[0]} `);
    const next = replaced + after;
    setBody(next);
    setQuery(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      const pos = replaced.length;
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const send = () => {
    const v = body.trim();
    if (!v) return;
    onSend(v);
    setBody("");
    setQuery(null);
  };

  return (
    <div className="relative">
      {matches.length > 0 && (
        <div className="absolute bottom-full mb-1 w-56 overflow-hidden rounded-card bg-overlay p-1 shadow-[var(--shadow-overlay)]">
          {matches.map((m, i) => (
            <button
              key={m.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm",
                i === active ? "bg-raised" : "hover:bg-raised/60",
              )}
            >
              <Avatar name={m.name} email={m.email} image={m.image} size={20} />
              <span className="min-w-0 flex-1 truncate">{m.name ?? m.email}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (matches.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              setActive((a) =>
                e.key === "ArrowDown"
                  ? Math.min(a + 1, matches.length - 1)
                  : Math.max(a - 1, 0),
              );
              return;
            }
            if (matches.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              pick(matches[active]);
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Comment — @ to mention, Enter to send"
          aria-label="Write a comment"
          className="max-h-32 min-h-10 w-full flex-1 resize-none rounded-control bg-raised px-3.5 py-2.5 text-sm outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/30"
        />
        <Button size="sm" variant="quiet" onClick={send} disabled={!body.trim()} aria-label="Send comment">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
