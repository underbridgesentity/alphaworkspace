/**
 * Client API access. Reads are plain fetches (the service worker serves
 * cached copies offline); mutations are offline-aware — when the network
 * isn't there, they queue in the outbox and the UI stays optimistic.
 */
import { enqueue } from "./outbox";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly limit?: "members" | "projects" | "captures";

  constructor(
    code: string,
    message: string,
    status: number,
    limit?: ApiError["limit"],
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.limit = limit;
  }
}

async function throwFrom(res: Response): Promise<never> {
  let code = "error";
  let message = "Something went wrong. Try again.";
  let limit: ApiError["limit"];
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string; limit?: ApiError["limit"] };
    };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
    limit = body.error?.limit;
  } catch {
    // non-JSON error body — keep defaults
  }
  throw new ApiError(code, message, res.status, limit);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) await throwFrom(res);
  return res.json() as Promise<T>;
}

export type MutateResult<T> = { queued: true } | ({ queued?: false } & T);

/**
 * Fire a mutation. Offline (or on network failure) it queues for background
 * sync and resolves { queued: true } so callers keep their optimistic state.
 * Server-side rejections (4xx/5xx) throw — those are real answers.
 */
export async function apiMutate<T>(
  path: string,
  opts: { method: "POST" | "PATCH" | "DELETE"; body?: unknown },
): Promise<MutateResult<T>> {
  const queue = async (): Promise<{ queued: true }> => {
    await enqueue({ url: path, method: opts.method, body: opts.body });
    return { queued: true };
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) return queue();

  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method,
      headers: { "content-type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    return queue(); // network dropped mid-request
  }
  if (!res.ok) await throwFrom(res);
  return res.json() as Promise<MutateResult<T>>;
}
