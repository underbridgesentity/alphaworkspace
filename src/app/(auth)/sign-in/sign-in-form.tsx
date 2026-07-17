"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createPasswordAccount,
  signInWithEmail,
  signInWithGoogle,
  signInWithPassword,
} from "./actions";

export type SignInMode = "link" | "password" | "create";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} className="w-full">
      {label}
    </Button>
  );
}

function GoogleSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      size="lg"
      loading={pending}
      className="w-full"
    >
      <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
        <path
          fill="#4285F4"
          d="M23.5 12.27c0-.85-.08-1.67-.22-2.46H12v4.65h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.1 3.57-5.17 3.57-8.81Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
        />
      </svg>
      Continue with Google
    </Button>
  );
}

function ModeLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press rounded-control text-sm font-medium text-accent hover:text-accent-hover"
    >
      {children}
    </button>
  );
}

export function SignInForm({
  googleEnabled,
  next,
  initialMode = "link",
}: {
  googleEnabled: boolean;
  next: string;
  initialMode?: SignInMode;
}) {
  const [mode, setMode] = useState<SignInMode>(initialMode);

  const emailField = (
    <Input
      type="email"
      name="email"
      required
      autoComplete="email"
      inputMode="email"
      placeholder="you@studio.co.za"
      aria-label="Email address"
      className="h-12 text-[1.0625rem]"
    />
  );

  return (
    <div className="mt-6 space-y-3">
      {mode === "link" && (
        <form action={signInWithEmail} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          {emailField}
          <Submit label="Email me a sign-in link" />
        </form>
      )}

      {mode === "password" && (
        <form action={signInWithPassword} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          {emailField}
          <Input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="Your password"
            aria-label="Password"
            className="h-12 text-[1.0625rem]"
          />
          <Submit label="Sign in" />
        </form>
      )}

      {mode === "create" && (
        <form action={createPasswordAccount} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          {emailField}
          <Input
            type="password"
            name="password"
            required
            minLength={10}
            autoComplete="new-password"
            placeholder="Choose a password (10+ characters)"
            aria-label="New password"
            className="h-12 text-[1.0625rem]"
          />
          <Submit label="Create account" />
          <p className="text-xs text-faint">
            We&apos;ll email you a confirmation link. Your password starts
            working the moment you click it.
          </p>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
        {mode !== "link" && (
          <ModeLink onClick={() => setMode("link")}>
            Email me a link instead
          </ModeLink>
        )}
        {mode !== "password" && (
          <ModeLink onClick={() => setMode("password")}>
            Use a password
          </ModeLink>
        )}
        {mode !== "create" && (
          <ModeLink onClick={() => setMode("create")}>
            Create an account with a password
          </ModeLink>
        )}
      </div>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 py-1 text-xs text-faint">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <GoogleSubmit />
          </form>
        </>
      )}
    </div>
  );
}
