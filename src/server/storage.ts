import "server-only";

/**
 * Supabase Storage REST access for task attachments — signed upload/download
 * URLs so bytes go browser↔Supabase directly (never through our functions).
 * Uses the service-role key (server only). Bucket: "attachments", private.
 */

const BUCKET = "attachments";

function base(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export function storageConfigured(): boolean {
  return base() !== null;
}

async function sb(path: string, init: RequestInit): Promise<Response> {
  const b = base();
  if (!b) throw new Error("Supabase Storage not configured");
  return fetch(`${b.url}/storage/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${b.key}`,
      apikey: b.key,
      ...(init.headers ?? {}),
    },
  });
}

/** One-time signed URL the browser PUTs the file to. */
export async function signedUploadUrl(
  path: string,
): Promise<{ url: string; token: string }> {
  const res = await sb(`/object/upload/sign/${BUCKET}/${path}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`sign upload failed: ${res.status}`);
  const body = (await res.json()) as { url: string; token: string };
  // The signed URL is relative to the storage host.
  const b = base()!;
  return {
    url: body.url.startsWith("http") ? body.url : `${b.url}/storage/v1${body.url}`,
    token: body.token,
  };
}

/** Short-lived signed download URL (private bucket). */
export async function signedDownloadUrl(
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const res = await sb(`/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new Error(`sign download failed: ${res.status}`);
  const body = (await res.json()) as { signedURL: string };
  const b = base()!;
  return `${b.url}/storage/v1${body.signedURL}`;
}

export async function deleteObject(path: string): Promise<void> {
  await sb(`/object/${BUCKET}/${path}`, { method: "DELETE" });
}

/** Idempotently ensure the private bucket exists (called on first upload). */
export async function ensureBucket(): Promise<void> {
  const res = await sb(`/bucket`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: 26_214_400, // 25 MB per file
    }),
  });
  // 400 = already exists; anything else worth surfacing.
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    console.warn("[storage] ensureBucket:", res.status, await res.text());
  }
}
