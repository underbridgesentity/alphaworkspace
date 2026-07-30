/**
 * Client API access. Reads are plain fetches (the service worker serves
 * cached copies offline); mutations are offline-aware, when the network
 * isn't there, they queue in the outbox and the UI stays optimistic.
 */
import { enqueue } from "./outbox";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly limit?: "members" | "projects" | "captures" | "meetings" | "storage" | "feature";
  /** Which feature, when limit === "feature". */
  readonly feature?: string;

  constructor(
    code: string,
    message: string,
    status: number,
    limit?: ApiError["limit"],
    feature?: string,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.limit = limit;
    this.feature = feature;
  }
}

async function throwFrom(res: Response): Promise<never> {
  let code = "error";
  let message = "Something went wrong. Try again.";
  let limit: ApiError["limit"];
  let feature: string | undefined;
  try {
    const body = (await res.json()) as {
      error?: {
        code?: string;
        message?: string;
        limit?: ApiError["limit"];
        feature?: string;
      };
    };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
    limit = body.error?.limit;
    feature = body.error?.feature;
  } catch {
    // non-JSON error body, keep defaults
  }
  throw new ApiError(code, message, res.status, limit, feature);
}

/**
 * `signal` should be threaded from the React Query queryFn. Without it,
 * qc.cancelQueries only cancels the query STATE while the HTTP request keeps
 * flying, which is how deleting a task still produced a 404 from its own
 * /time endpoint: the panel's just-mounted fetch could not be aborted, raced
 * the DELETE, and landed after the row was gone.
 */
export async function apiGet<T>(
  path: string,
  opts: { signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(path, {
    headers: { accept: "application/json" },
    signal: opts.signal,
  });
  if (!res.ok) await throwFrom(res);
  return res.json() as Promise<T>;
}

export type MutateResult<T> = { queued: true } | ({ queued?: false } & T);

/**
 * Fire a mutation. Offline (or on network failure) it queues for background
 * sync and resolves { queued: true } so callers keep their optimistic state.
 * Server-side rejections (4xx/5xx) throw, those are real answers.
 *
 * Pass `queue: false` for anything that MOVES MONEY. A queued write replays
 * from the service worker later, with no tab open and nobody watching: a band
 * change that failed on a patchy link would silently apply minutes later, long
 * after the owner was told it did not, and could revert a decision they made
 * in between. Money must fail loudly instead of arriving late.
 */
export async function apiMutate<T>(
  path: string,
  opts: {
    method: "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    queue?: boolean;
  },
): Promise<MutateResult<T>> {
  const mayQueue = opts.queue !== false;
  const queue = async (): Promise<{ queued: true }> => {
    await enqueue({ url: path, method: opts.method, body: opts.body });
    return { queued: true };
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    if (!mayQueue) throw new ApiError("offline", "You need a connection for that", 0);
    return queue();
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method,
      headers: { "content-type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    // Network dropped mid-request. We cannot know whether the server saw it,
    // so for money the only safe answer is to surface it, never to replay it.
    if (!mayQueue) {
      throw new ApiError(
        "offline",
        "The connection dropped. Check your billing page before trying again.",
        0,
      );
    }
    return queue();
  }
  if (!res.ok) await throwFrom(res);
  return res.json() as Promise<MutateResult<T>>;
}
