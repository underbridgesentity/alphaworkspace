"use client";

/**
 * Session-aware marketing nav actions. Server-rendered as the signed-out
 * pair (Sign in + Start free) so marketing stays static; after mount a
 * cheap authed fetch flips it to one clear "Open Alpha" button, so someone
 * with a live session can SEE they're signed in instead of being surprised
 * by a silent redirect.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function NavCta() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/workspaces", { headers: { accept: "application/json" } })
      .then((res) => {
        if (alive) setSignedIn(res.ok);
      })
      .catch(() => {
        if (alive) setSignedIn(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (signedIn) {
    return (
      <Link
        href="/app"
        className="press flex items-center gap-1.5 whitespace-nowrap rounded-control bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover sm:px-4"
      >
        Open Alpha
        <ArrowRight className="size-4" />
      </Link>
    );
  }

  return (
    <>
      {/* Visible at EVERY width; people with accounts need the door too. */}
      <Link
        href="/sign-in"
        className="press whitespace-nowrap rounded-control px-3 py-2 text-sm font-medium text-ink hover:bg-raised"
      >
        Sign in
      </Link>
      <Link
        href="/sign-in"
        className="press whitespace-nowrap rounded-control bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover sm:px-4"
      >
        Start free
      </Link>
    </>
  );
}
