"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/server/auth";

function safeNext(raw: unknown): string {
  const next = typeof raw === "string" ? raw : "";
  // Only same-app relative paths — never an open redirect.
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
  await signIn("resend", { email, redirectTo: next });
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNext(formData.get("next"));
  await signIn("google", { redirectTo: next });
}
