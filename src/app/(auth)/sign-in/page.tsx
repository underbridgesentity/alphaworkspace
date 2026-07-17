import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled } from "@/server/auth";
import { getUser } from "@/server/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const ERROR_COPY: Record<string, string> = {
  BadEmail: "That email doesn't look right, check it and try again.",
  Verification:
    "That sign-in link expired or was already used. Enter your email for a fresh one.",
  OAuthAccountNotLinked:
    "That email already signed in a different way. Use the same method as before.",
  AccessDenied: "Sign-in was cancelled. Try again when you're ready.",
  Configuration: "Sign-in isn't fully configured on this server yet.",
  Default: "Sign-in hit a snag. Please try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const user = await getUser();
  if (user) redirect(params.next?.startsWith("/") ? params.next : "/app");

  const error = params.error
    ? (ERROR_COPY[params.error] ?? ERROR_COPY.Default)
    : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1.5 text-muted">
        A magic link, no password. New here? The same door creates your
        account.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-control bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <SignInForm
        googleEnabled={googleEnabled}
        next={params.next?.startsWith("/") ? params.next : "/app"}
      />

      <p className="mt-6 text-sm text-faint">
        By continuing you agree to our{" "}
        <a href="/privacy" className="underline hover:text-muted">
          privacy policy
        </a>
        , including POPIA consent to process your account details.
      </p>
    </div>
  );
}
