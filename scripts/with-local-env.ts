/**
 * Runs a command against the LOCAL development database, and refuses to run
 * against anything else.
 *
 *   tsx scripts/with-local-env.ts <command> [args...]
 *
 * Why this exists: `.env.local` on this machine holds PRODUCTION credentials
 * (Supabase, live PayFast, Resend, Deepgram). Next loads it automatically in
 * dev, so `npm run dev` talks to production and any poking around lands in the
 * real product. That is why nobody has been able to look at the app.
 *
 * How the override is airtight: @next/env only assigns a key from a .env file
 * when that key is absent from the process env it started with (see
 * `processEnv` in @next/env). So every key we inject here WINS over
 * `.env.local`, permanently, for the whole child process. `.env.dev-local`
 * therefore shadows every production secret by name, not just DATABASE_URL:
 * a local session must not be able to charge a live PayFast account or send
 * real email.
 *
 * This script never reads, prints, or copies `.env.local`.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isLocalDatabaseUrl, LOCAL_DEV_FLAG } from "../src/lib/local-db";

const ENV_FILE = ".env.dev-local";
const EXAMPLE_FILE = ".env.dev-local.example";

function fail(message: string): never {
  console.error(`\nlocal dev refused to start:\n  ${message}\n`);
  process.exit(1);
}

/** Minimal KEY=VALUE reader. No interpolation, no exports, quotes stripped. */
function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);
    if (key) out[key] = value;
  }
  return out;
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  fail("usage: tsx scripts/with-local-env.ts <command> [args...]");
}

// Belt and braces: this runner has no business inside a production process.
if (process.env.NODE_ENV === "production") {
  fail("NODE_ENV=production. The local runner is development-only.");
}

const root = process.cwd();
const envPath = path.join(root, ENV_FILE);
if (!existsSync(envPath)) {
  fail(
    `${ENV_FILE} not found.\n  Copy ${EXAMPLE_FILE} to ${ENV_FILE} and set DATABASE_URL to your local Postgres.\n` +
      `  Do NOT copy .env.local, it points at production.`,
  );
}

const parsed = parseEnvFile(readFileSync(envPath, "utf8"));

// The one check that matters. Fails closed on missing, malformed, or remote.
if (!isLocalDatabaseUrl(parsed.DATABASE_URL)) {
  fail(
    `DATABASE_URL in ${ENV_FILE} is not a local Postgres URL.\n` +
      "  Expected postgresql://…@localhost/… (or 127.0.0.1). Refusing to run: " +
      "this is the guard that keeps local development off production.",
  );
}

const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
  ...parsed,
  NODE_ENV: "development",
  [LOCAL_DEV_FLAG]: "1",
};

const dbName = new URL(parsed.DATABASE_URL).pathname.replace(/^\//, "");
console.log(`local dev: database "${dbName}" on ${new URL(parsed.DATABASE_URL).hostname}`);

const child = spawn(command, args, {
  cwd: root,
  env: childEnv,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
child.on("error", (err) => {
  fail(`could not start "${command}": ${err.message}`);
});
