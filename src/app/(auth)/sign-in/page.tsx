import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled } from "@/server/auth";
import { getUser } from "@/server/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const ERROR_COPY: Record<string, string> = {
  BadEmail: "That email doesn't look right, check it and try again.",
  RateLimited:
    "Too many attempts in a short time. Wait a few minutes and try again.",
  Verification:
    "That sign-in link expired or was already used. Enter your email for a fresh one.",
  OAuthAccountNotLinked:
    "That email already signed in a different way. Use the same method as before.",
  AccessDenied: "Sign-in was cancelled. Try again when you're ready.",
  Configuration: "Sign-in isn't fully configured on this server yet.",
  BadPassword: "That email and password don't match.",
  CredentialsSignin: "That email and password don't match.",
  Unverified:
    "Almost there: click the confirmation link we emailed you first, then your password works.",
  NoPassword:
    "This account signs in with an email link or Google. Sign in that way, then add a password under Account.",
  AccountExists:
    "That email already has an account. Sign in with an email link or Google, then add a password under Account.",
  WeakPassword: "Use at least 10 characters, a short sentence works well.",
  Default: "Sign-in hit a snag. Please try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const user = await getUser();
  // Relative paths only; "//host" is protocol-relative and leaves the site.
  const next =
    params.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/app";
  if (user) redirect(next);

  const error = params.error
    ? (ERROR_COPY[params.error] ?? ERROR_COPY.Default)
    : null;
  const mode =
    params.mode === "password" || params.mode === "create"
      ? params.mode
      : "link";

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "create" ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-1.5 text-muted">
        {mode === "create"
          ? "An email and a password, confirmed with one click."
          : "A magic link, a password, or Google. New here? The same door creates your account."}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-control bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <SignInForm googleEnabled={googleEnabled} next={next} initialMode={mode} />

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
