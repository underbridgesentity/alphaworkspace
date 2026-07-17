/**
 * @mention matching, shared by the server (notify on comment) and the
 * composer autocomplete. Matches @Full Name, @First or @email-prefix,
 * longest candidate first so "@Thabo Nkosi" beats "@Thabo".
 */
export interface Mentionable {
  id: string;
  name: string | null;
  email: string;
}

function candidatesFor(m: Mentionable): string[] {
  const out = new Set<string>();
  const name = m.name?.trim();
  if (name) {
    out.add(name);
    const first = name.split(/\s+/)[0];
    if (first.length >= 2) out.add(first);
  }
  const prefix = m.email.split("@")[0];
  if (prefix.length >= 2) out.add(prefix);
  return [...out];
}

/** Unique members mentioned in a body. */
export function matchMentions<T extends Mentionable>(
  body: string,
  members: T[],
): T[] {
  const hits = new Map<string, T>();
  // Longest candidate first, and consume matched spans so "@Thabo Nkosi"
  // doesn't also fire "@Thabo" for a different Thabo inside the same span.
  const pairs = members
    .flatMap((m) => candidatesFor(m).map((c) => ({ c, m })))
    .sort((a, b) => b.c.length - a.c.length);
  const consumed: [number, number][] = [];

  for (const { c, m } of pairs) {
    if (hits.has(m.id)) continue;
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@${escaped}(?![\\w.-])`, "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(body)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (consumed.some(([s, e]) => start < e && end > s)) continue;
      consumed.push([start, end]);
      hits.set(m.id, m);
      break;
    }
  }
  return [...hits.values()];
}
