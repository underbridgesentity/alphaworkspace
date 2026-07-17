/**
 * Server-side transcription, the Wispr-grade layer. Deepgram nova-3 with
 * per-request KEYTERM BIASING: we prime the recognizer with this workspace's
 * project names, client names and teammate names, so South African names and
 * agency jargon land right where the browser's built-in recognizer fumbles.
 *
 * Audio is transcribed and discarded, never stored (POPIA). Falls back to
 * the client's on-device transcript when no DEEPGRAM_API_KEY is set.
 */

export interface TranscribeContext {
  /** Vocabulary to bias toward: names, projects, clients, labels. */
  keyterms: string[];
}

export interface TranscribeResult {
  transcript: string;
  engine: string;
}

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

const MODEL = () => process.env.DEEPGRAM_MODEL ?? "nova-3";

export async function transcribeAudio(
  audio: ArrayBuffer,
  mime: string,
  context: TranscribeContext,
): Promise<TranscribeResult> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("Transcription not configured");

  const params = new URLSearchParams({
    model: MODEL(),
    smart_format: "true",
    punctuate: "true",
    language: "en",
    // SA English is closest to en-GB conventions; nova-3 handles the accent.
    filler_words: "false",
  });
  // Keyterm biasing (nova-3): repeatable param, capped to keep the URL sane.
  for (const term of dedupeTerms(context.keyterms).slice(0, 90)) {
    params.append("keyterm", term);
  }

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { authorization: `Token ${key}`, "content-type": mime || "audio/webm" },
    body: audio,
  });
  if (!res.ok) {
    throw new Error(`deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    results?: {
      channels?: { alternatives?: { transcript?: string }[] }[];
    };
  };
  const transcript =
    body.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  return { transcript, engine: MODEL() };
}

/** Build the keyterm list from workspace context (names, first names, clients). */
export function keytermsFrom(input: {
  members: { name: string | null; email: string }[];
  projects: { name: string; clientName: string | null }[];
  labels: { name: string }[];
}): string[] {
  const terms: string[] = [];
  for (const m of input.members) {
    if (m.name) {
      terms.push(m.name);
      const first = m.name.trim().split(/\s+/)[0];
      if (first.length >= 2) terms.push(first);
    }
  }
  for (const p of input.projects) {
    terms.push(p.name);
    if (p.clientName) terms.push(p.clientName);
  }
  for (const l of input.labels) terms.push(l.name);
  return dedupeTerms(terms);
}

function dedupeTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const t = raw.trim();
    if (t.length < 2 || t.length > 60) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
