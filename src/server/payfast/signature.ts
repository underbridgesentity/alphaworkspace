/**
 * PayFast signature primitives. Two quirks matter and both are locked by
 * tests:
 *  - values are urlencoded PHP-style (spaces as "+", uppercase hex,
 *    -_.  left bare, everything else encoded)
 *  - the checkout/ITN signature hashes fields in the ORDER GIVEN (form
 *    order / received order), never alphabetically. (The subscriptions API
 *    is the opposite, see subscriptions.ts.)
 */
import { createHash } from "node:crypto";

/** PHP urlencode() semantics. */
export function pfUrlEncode(value: string): string {
  let out = "";
  for (const char of value) {
    if (/[A-Za-z0-9\-_.]/.test(char)) {
      out += char;
    } else if (char === " ") {
      out += "+";
    } else {
      const bytes = Buffer.from(char, "utf8");
      for (const b of bytes) {
        out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return out;
}

function paramString(
  params: Iterable<[string, string]>,
  passphrase?: string,
): string {
  const parts: string[] = [];
  for (const [name, value] of params) {
    if (name === "signature") continue;
    if (value === "") continue; // PayFast skips empties
    parts.push(`${name}=${pfUrlEncode(value)}`);
  }
  if (passphrase) parts.push(`passphrase=${pfUrlEncode(passphrase)}`);
  return parts.join("&");
}

/** md5 over the ordered param string (+passphrase). */
export function buildSignature(
  params: Iterable<[string, string]>,
  passphrase?: string,
): string {
  return createHash("md5")
    .update(paramString(params, passphrase))
    .digest("hex");
}

/** Verify an ITN payload's signature using its received parameter order. */
export function verifyItnSignature(
  params: Array<[string, string]> | URLSearchParams,
  passphrase?: string,
): boolean {
  const entries: Array<[string, string]> =
    params instanceof URLSearchParams ? [...params.entries()] : [...params];
  const received = entries.find(([k]) => k === "signature")?.[1];
  if (!received) return false;
  const expected = buildSignature(entries, passphrase);
  return expected === received.toLowerCase();
}
