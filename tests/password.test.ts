/**
 * Password accounts: registration, the anti-squatting verification gate,
 * credential checks, and set/change from Account.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import {
  checkCredentials,
  registerWithPassword,
  setPassword,
} from "@/server/auth-password";
import { createTestDb, createTestUser } from "./helpers/db";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

describe("password accounts", () => {
  it("registers, refuses the password until the email is verified, then signs in", async () => {
    const reg = await registerWithPassword(db, "Nandi@Studio.co.za", "correct horse battery");
    expect(reg.ok).toBe(true);

    // Unverified: correct password is still refused (squatting is pointless).
    const before = await checkCredentials(db, "nandi@studio.co.za", "correct horse battery");
    expect(before).toEqual({ ok: false, reason: "unverified" });

    // The magic-link click sets emailVerified; then the password works.
    await db
      .update(schema.users)
      .set({ emailVerified: new Date() })
      .where(eq(schema.users.email, "nandi@studio.co.za"));
    const after = await checkCredentials(db, "NANDI@studio.co.za", "correct horse battery");
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.user.email).toBe("nandi@studio.co.za");

    // Wrong password, wrong reason never leaks which part failed.
    const wrong = await checkCredentials(db, "nandi@studio.co.za", "wrong password 123");
    expect(wrong).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses registering an email that already has an account", async () => {
    await createTestUser(db, "existing@studio.co.za", "Existing");
    const reg = await registerWithPassword(db, "existing@studio.co.za", "some long password");
    expect(reg.ok).toBe(false);
    if (!reg.ok) expect(reg.reason).toBe("exists");
  });

  it("passwordless users get a clear signal, not a fake mismatch", async () => {
    const user = await createTestUser(db, "linkonly@studio.co.za", "Linky");
    await db
      .update(schema.users)
      .set({ emailVerified: new Date() })
      .where(eq(schema.users.id, user.id));
    const res = await checkCredentials(db, "linkonly@studio.co.za", "whatever whatever");
    expect(res).toEqual({ ok: false, reason: "no-password" });
  });

  it("enforces policy and the current-password check on change", async () => {
    const user = await createTestUser(db, "changer@studio.co.za", "Changer");

    const tooShort = await setPassword(db, user.id, { next: "short" });
    expect(tooShort.ok).toBe(false);

    const first = await setPassword(db, user.id, { next: "a perfectly fine one" });
    expect(first.ok).toBe(true);

    const badCurrent = await setPassword(db, user.id, {
      current: "not it",
      next: "another good password",
    });
    expect(badCurrent.ok).toBe(false);

    const good = await setPassword(db, user.id, {
      current: "a perfectly fine one",
      next: "another good password",
    });
    expect(good.ok).toBe(true);
  });
});
