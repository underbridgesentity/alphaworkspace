"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWorkspaceAction, type OnboardingState } from "./actions";

export function OnboardingForm({ plan }: { plan?: string | null }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    createWorkspaceAction,
    {},
  );

  return (
    <form action={action} className="mt-6 space-y-4">
      {plan && <input type="hidden" name="plan" value={plan} />}
      <Input
        name="name"
        required
        minLength={2}
        maxLength={60}
        placeholder="e.g. Underbridge Studio"
        aria-label="Workspace name"
        autoFocus
        className="h-12 text-[1.0625rem]"
      />

      <label className="flex items-start gap-3 rounded-card bg-surface p-4 cursor-pointer">
        <input
          type="checkbox"
          name="seedStarter"
          defaultChecked
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span>
          <span className="font-medium">Start with the Agency starter</span>
          <span className="mt-0.5 block text-sm text-muted">
            A sample client project with realistic tasks, so the board teaches
            itself. Delete it any time.
          </span>
        </span>
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Create workspace
      </Button>
    </form>
  );
}
