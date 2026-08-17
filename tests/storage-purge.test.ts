/**
 * deleteObjects() batching.
 *
 * This exists because the naive shape (one HTTP DELETE per object) is the kind
 * of thing that passes every test on a fixture with three attachments and then
 * times out on a real workspace with twelve thousand. Attachment quota is
 * measured in bytes, not rows, so the row count has no ceiling: a Studio
 * workspace can hold tens of thousands of small files.
 *
 * The failure that matters is not slowness. The purge runs BEFORE the rows are
 * deleted, so a function that dies mid-purge leaves the objects gone and the
 * workspace still present, pointing at files that no longer exist, and every
 * retry shaves off another slice while the deletion never completes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_FETCH = globalThis.fetch;

/** Every request the helper made, newest last. */
let requests: {
  url: string;
  method: string;
  contentType: string;
  prefixes: string[];
}[] = [];

function record(url: string, init: RequestInit) {
  requests.push({
    url: String(url),
    method: String(init.method),
    contentType: String(
      (init.headers as Record<string, string> | undefined)?.["content-type"],
    ),
    prefixes: JSON.parse(String(init.body)).prefixes,
  });
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
  requests = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    record(url, init);
    return new Response(JSON.stringify(ok(init)), { status: 200 });
  }) as unknown as typeof fetch;
});

/** The real endpoint answers with the objects it removed; mirror that. */
function ok(init: RequestInit): { name: string }[] {
  return JSON.parse(String(init.body)).prefixes.map((name: string) => ({ name }));
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.unstubAllEnvs();
  // Not just tidiness: a test that fails before its own mockRestore() leaks
  // its console spy into the next test, which then fails for a reason that
  // has nothing to do with what it is testing.
  vi.restoreAllMocks();
});

describe("deleteObjects", () => {
  it("addresses the bucket endpoint the storage API actually implements", async () => {
    const { deleteObjects } = await import("@/server/storage");
    await deleteObjects(["ws-1/a.pdf"]);

    // Without this, pointing the purge at a URL that does not exist leaves
    // every other test in this file green while nothing is ever deleted:
    // exactly the "reports success, removes nothing" failure.
    expect(requests[0].url).toBe(
      "https://project.supabase.test/storage/v1/object/attachments",
    );
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].contentType).toBe("application/json");
  });

  it("counts what the response says was removed, not the status code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // 200 OK with an empty array is what an under-privileged key produces:
    // RLS filters every object and the purge silently removes nothing.
    globalThis.fetch = (async () =>
      new Response("[]", { status: 200 })) as unknown as typeof fetch;

    const { deleteObjects } = await import("@/server/storage");
    await deleteObjects(["ws-1/a.pdf", "ws-1/b.pdf"]);

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("2 failed");
  });

  it("covers every path exactly once, in few requests", async () => {
    const { deleteObjects } = await import("@/server/storage");
    const paths = Array.from({ length: 2_500 }, (_, i) => `ws-1/file-${i}.pdf`);

    await deleteObjects(paths);

    const sent = requests.flatMap((r) => r.prefixes);
    expect(sent).toHaveLength(2_500);
    expect(new Set(sent).size).toBe(2_500);
    // 2 500 / 100 = 25. The old one-per-object shape would have made 2 500.
    expect(requests.length).toBeLessThanOrEqual(30);
  });

  it("deletes a path shared by two collection queries only once", async () => {
    const { deleteObjects } = await import("@/server/storage");
    // deleteAccount collects a meeting twice when it sits inside a workspace
    // that also dies with the account.
    await deleteObjects(["m/a.opus", "m/a.opus", "att/b.pdf"]);

    expect(requests.flatMap((r) => r.prefixes)).toEqual(["m/a.opus", "att/b.pdf"]);
  });

  it("makes no request at all for an empty list", async () => {
    const { deleteObjects } = await import("@/server/storage");
    await deleteObjects([]);
    expect(requests).toHaveLength(0);
  });

  it("reports a count when the bucket refuses, and never a path", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = (async () =>
      new Response("nope", { status: 500 })) as unknown as typeof fetch;

    const { deleteObjects } = await import("@/server/storage");
    await deleteObjects(["ws-7/client-brief.pdf", "ws-7/audio.opus"]);

    expect(warn).toHaveBeenCalledOnce();
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("2 failed");
    expect(message).toContain("of 2 objects");
    // Paths carry the workspace id and the user's own filename.
    expect(message).not.toContain("client-brief");
    expect(message).not.toContain("ws-7");
    warn.mockRestore();
  });

  it("gives up on its time budget instead of overrunning the function", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Every request burns 5 seconds of the 45s budget, so the purge must stop
    // itself after ~9 batches rather than working through all 50.
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      now += 5_000;
      record(url, init);
      return new Response(JSON.stringify(ok(init)), { status: 200 });
    }) as unknown as typeof fetch;

    const { deleteObjects } = await import("@/server/storage");
    const paths = Array.from({ length: 5_000 }, (_, i) => `ws/f-${i}`);

    // The contract that matters: it RETURNS. The caller still has to delete
    // the rows, and an account that cannot be deleted is the worse failure.
    await deleteObjects(paths);

    expect(requests.length).toBeLessThan(12);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("skipped on time budget");

    vi.mocked(Date.now).mockRestore();
    warn.mockRestore();
  });

  it("does not let a thrown request abort the remaining batches", async () => {
    let call = 0;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      call++;
      if (call === 1) throw new Error("socket hang up");
      record(url, init);
      return new Response(JSON.stringify(ok(init)), { status: 200 });
    }) as unknown as typeof fetch;

    const { deleteObjects } = await import("@/server/storage");
    const paths = Array.from({ length: 250 }, (_, i) => `ws/f-${i}`);
    await deleteObjects(paths);

    // First batch of 100 died; the other 150 must still have been attempted,
    // because a deletion request must make as much progress as it can.
    expect(requests.flatMap((r) => r.prefixes)).toHaveLength(150);
  });
});
