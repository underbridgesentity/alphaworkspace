"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/server/auth";
import { checkRateLimit } from "@/server/ai/ratelimit";

function safeNext(raw: unknown): string {
  const next = typeof raw === "string" ? raw : "";
  // Only same-app relative paths, never an open redirect.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/app";
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
