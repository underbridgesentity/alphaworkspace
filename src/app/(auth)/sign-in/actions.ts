"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/server/auth";
import { safeRelativePath } from "@/lib/safe-path";
import { checkRateLimit } from "@/server/ai/ratelimit";

function safeNext(raw: unknown): string {
  // Only same-app relative paths, never an open redirect (backslash-authority
  // tricks like /\evil.com are rejected by safeRelativePath).
  return safeRelativePath(typeof raw === "string" ? raw : null) ?? "/app";
}

export async function signInWithEmail(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const next = safeNext(formData.get("next"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`/sign-in?error=BadEmail&next=${encodeURIComponent(next)}`);
  }

  // Magic links cost money and land in real inboxes: cap per caller AND per
  // target address. (In-memory, per-instance; enough to blunt casual abuse.)
  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown")
    .split(",")[0]
    .trim();
  if (
    !checkRateLimit(`magic-ip:${ip}`, 6, 10 * 60_000) ||
    !checkRateLimit(`magic-email:${email}`, 3, 10 * 60_000)
  ) {
    redirect(`/sign-in?error=RateLimited&next=${encodeURIComponent(next)}`);
  }

  await signIn("resend", { email, redirectTo: next });
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNext(formData.get("next"));
  await signIn("google", { redirectTo: next });
}

export async function signInWithPassword(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const back = (error: string) =>
    redirect(`/sign-in?error=${error}&mode=password&next=${encodeURIComponent(next)}`);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("BadEmail");

  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown")
    .split(",")[0]
    .trim();
  if (
    !checkRateLimit(`pw-ip:${ip}`, 10, 10 * 60_000) ||
    !checkRateLimit(`pw-try:${email}`, 6, 10 * 60_000)
  ) {
    back("RateLimited");
  }

  // Pre-check for a precise message; signIn() re-validates the same way.
  const { checkCredentials } = await import("@/server/auth-password");
  const { db } = await import("@/server/db");
  const result = await checkCredentials(db, email, password);
  if (!result.ok) {
    if (result.reason === "unverified") back("Unverified");
    if (result.reason === "no-password") back("NoPassword");
    back("BadPassword");
  }

  await signIn("password", { email, password, redirectTo: next });
}

export async function createPasswordAccount(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const back = (error: string) =>
    redirect(`/sign-in?error=${error}&mode=create&next=${encodeURIComponent(next)}`);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("BadEmail");

  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown")
    .split(",")[0]
    .trim();
  if (!checkRateLimit(`pw-create:${ip}`, 5, 60 * 60_000)) back("RateLimited");

  const { registerWithPassword } = await import("@/server/auth-password");
  const { db } = await import("@/server/db");
  const result = await registerWithPassword(db, email, password);
  if (!result.ok) {
    back(result.reason === "exists" ? "AccountExists" : "WeakPassword");
  }

  // The magic link doubles as email verification; the password starts
  // working the moment they click it.
  await signIn("resend", { email, redirectTo: next });
}
