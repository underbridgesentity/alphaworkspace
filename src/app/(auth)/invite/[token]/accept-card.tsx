"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { acceptInviteAction, type AcceptState } from "./actions";

export function AcceptInviteCard({
  token,
  workspaceName,
}: {
  token: string;
  workspaceName: string;
}) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(
    acceptInviteAction.bind(null, token),
    {},
  );

  return (
    <form action={action} className="mt-6 space-y-3">
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Join {workspaceName}
      </Button>
    </form>
  );
}
