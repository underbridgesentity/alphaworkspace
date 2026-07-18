import "server-only";

/**
 * Supabase Storage REST access for task attachments, signed upload/download
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

/**
 * The ACTUAL stored byte size of an object (server-side truth), or null if it
 * can't be read. Used to reconcile the client-declared size on confirm so a
 * caller can't under-report to slip past the storage quota.
 */
export async function objectSize(path: string): Promise<number | null> {
  // Metadata endpoint first (cheap JSON), then fall back to a HEAD.
  try {
    const info = await sb(`/object/info/${BUCKET}/${path}`, { method: "GET" });
    if (info.ok) {
      const body = (await info.json()) as {
        size?: number;
        contentLength?: number;
        metadata?: { size?: number; contentLength?: number };
      };
      const s =
        body.size ??
        body.contentLength ??
        body.metadata?.size ??
        body.metadata?.contentLength;
      if (typeof s === "number" && Number.isFinite(s)) return s;
    }
  } catch {
    // fall through to HEAD
  }
  try {
    const head = await sb(`/object/${BUCKET}/${path}`, { method: "HEAD" });
    const len = head.headers.get("content-length");
    if (len && Number.isFinite(Number(len))) return Number(len);
  } catch {
    // give up; caller treats null as "couldn't verify"
  }
  return null;
}

/**
 * Bucket-level per-file ceiling. Sized for meeting audio (~150 MB, two hours
 * of opus with headroom); attachments keep their own 25 MB cap in code
 * (dal/attachments.ts), the bucket limit is just the outer wall.
 */
const BUCKET_FILE_LIMIT = 157_286_400;

/** Idempotently ensure the private bucket exists (called on first upload). */
export async function ensureBucket(): Promise<void> {
  const res = await sb(`/bucket`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: BUCKET_FILE_LIMIT,
    }),
  });
  if (res.ok) return;
  // 400/409 = already exists; update it in place so an old 25 MB-limit
  // bucket learns the new ceiling. Anything else worth surfacing.
  if (res.status === 400 || res.status === 409) {
    const upd = await sb(`/bucket/${BUCKET}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ public: false, file_size_limit: BUCKET_FILE_LIMIT }),
    });
    if (!upd.ok) {
      console.warn("[storage] bucket update:", upd.status, await upd.text());
    }
    return;
  }
  console.warn("[storage] ensureBucket:", res.status, await res.text());
}
