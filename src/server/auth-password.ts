import "server-only";

/**
 * Password accounts, built to coexist with magic links and Google without
 * opening the classic squatting hole:
 *
 *  - A password only WORKS once the email is verified (the magic link the
 *    sign-up sends doubles as verification). Until then, credentials
 *    sign-in is refused, so registering someone else's address buys
 *    nothing: the moment the real owner clicks a magic link, they hold the
 *    account, and they can clear the intruder's password from Account.
 *  - Registering an email that already has an account is refused outright;
 *    existing passwordless users add a password from Account settings
 *    while signed in.
 *  - bcrypt (cost 11), minimum 10 characters, rate limited per IP+email
 *    at the call sites.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import { users } from "@/server/db/schema";

const BCRYPT_COST = 11;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `Use at least ${PASSWORD_MIN} characters, a short sentence works well`;
  }
  if (password.length > PASSWORD_MAX) return "That password is too long";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export type RegisterResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "exists" | "policy"; message: string };

/** Create a brand-new password account (unverified until the link is clicked). */
export async function registerWithPassword(
  db: Db,
  emailRaw: string,
  password: string,
): Promise<RegisterResult> {
  const email = emailRaw.trim().toLowerCase();
  const policy = passwordPolicyError(password);
  if (policy) return { ok: false, reason: "policy", message: policy };

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existing) {
    return {
      ok: false,
      reason: "exists",
      message:
        "That email already has an account. Sign in with an email link or Google, then add a password under Account.",
    };
  }

  const passwordHash = await hashPassword(password);
  const [row] = await db
    .insert(users)
    .values({ email, passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (!row) {
    return {
      ok: false,
      reason: "exists",
      message:
        "That email already has an account. Sign in with an email link or Google, then add a password under Account.",
    };
  }
  return { ok: true, userId: row.id };
}

export type CredentialCheck =
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; reason: "invalid" | "unverified" | "no-password" };

/** Validate email+password for the Credentials provider. */
export async function checkCredentials(
  db: Db,
  emailRaw: string,
  password: string,
): Promise<CredentialCheck> {
  const email = emailRaw.trim().toLowerCase();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerified: users.emailVerified,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email));

  // Burn a comparison even when the user is missing, keeps timing flat.
  const hash =
    user?.passwordHash ??
    "$2a$11$C6UzMDM.H6dfI/f/IKcEeO7ZBl5nGmhkO4nCFC0Ozt7oyXwFyR0hK";
  const matches = await bcrypt.compare(password, hash);

  if (!user) return { ok: false, reason: "invalid" };
  if (!user.passwordHash) return { ok: false, reason: "no-password" };
  if (!matches) return { ok: false, reason: "invalid" };
  if (!user.emailVerified) return { ok: false, reason: "unverified" };
  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

/** Set or change the signed-in user's password (Account settings). */
export async function setPassword(
  db: Db,
  userId: string,
  input: { current?: string; next: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const policy = passwordPolicyError(input.next);
  if (policy) return { ok: false, message: policy };

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return { ok: false, message: "Account not found" };

  if (user.passwordHash) {
    const okCurrent =
      input.current !== undefined &&
      (await bcrypt.compare(input.current, user.passwordHash));
    if (!okCurrent) {
      return { ok: false, message: "Your current password didn't match" };
    }
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.next) })
    .where(eq(users.id, userId));
  return { ok: true };
}

/** Remove the password (falls back to magic link / Google only). */
export async function removePassword(
  db: Db,
  userId: string,
  current: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));
  if (!user?.passwordHash) return { ok: true };
  if (!(await bcrypt.compare(current, user.passwordHash))) {
    return { ok: false, message: "Your current password didn't match" };
  }
  await db
    .update(users)
    .set({ passwordHash: null })
    .where(eq(users.id, userId));
  return { ok: true };
}
