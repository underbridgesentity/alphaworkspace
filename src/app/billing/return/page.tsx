import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Undo2 } from "lucide-react";
import { db } from "@/server/db";
import { workspaces } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Payment" };

/** PayFast lands people here after checkout (or cancelling it). */
export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string; cancelled?: string }>;
}) {
  const params = await searchParams;
  const cancelled = params.cancelled === "1";

  let slug: string | null = null;
  if (params.ws) {
    const [row] = await db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, params.ws));
    slug = row?.slug ?? null;
  }
  const backHref = slug ? `/w/${slug}/settings/billing` : "/app";

  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="max-w-sm text-center animate-fade-up">
        {cancelled ? (
          <>
            <Undo2 className="mx-auto size-9 text-faint" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">
              No charge made
            </h1>
            <p className="mt-2 text-muted">
              You backed out of checkout, nothing changed, and your workspace
              is exactly as you left it.
            </p>
          </>
        ) : (
          <>
            <CircleCheck className="mx-auto size-9 text-ok" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">
              Thanks, payment received
            </h1>
            <p className="mt-2 text-muted">
              PayFast is confirming the subscription. Your new band activates
              within a minute or two of their notification.
            </p>
          </>
        )}
        <Link
          href={backHref}
          className="mt-6 inline-block font-medium text-accent hover:text-accent-hover"
        >
          Back to your workspace →
        </Link>
      </div>
    </main>
  );
}
