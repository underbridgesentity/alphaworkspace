import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { getInvitePublic } from "@/server/dal/workspaces";
import { AcceptInviteCard } from "./accept-card";

export const metadata: Metadata = { title: "Workspace invite" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await requireUser();
  const invite = await getInvitePublic(db, token);

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          This invite isn’t valid anymore
        </h1>
        <p className="mt-2 text-muted">
          It may have expired or already been used. Ask a workspace admin to
          send a fresh one.
        </p>
        <Link
          href="/app"
          className="mt-6 inline-block text-accent hover:text-accent-hover font-medium"
        >
          Go to your workspaces →
        </Link>
      </div>
    );
  }

  const emailMismatch =
    invite.email.toLowerCase() !== user.email.toLowerCase();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Join {invite.workspaceName}
      </h1>
      <p className="mt-2 text-muted">
        You’ve been invited as{" "}
        <span className="text-ink font-medium">
          {invite.role === "admin" ? "an admin" : "a member"}
        </span>
        .
      </p>

      {emailMismatch ? (
        <div className="mt-6 rounded-card bg-surface p-4">
          <p className="text-sm">
            This invite was sent to{" "}
            <span className="font-medium">{invite.email}</span>, but you’re
            signed in as <span className="font-medium">{user.email}</span>.
          </p>
          <p className="mt-2 text-sm text-muted">
            Sign in with the invited address to accept it.
          </p>
        </div>
      ) : (
        <AcceptInviteCard token={token} workspaceName={invite.workspaceName} />
      )}
    </div>
  );
}
