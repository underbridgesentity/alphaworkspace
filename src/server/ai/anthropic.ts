import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * One place to resolve the Anthropic key. Accepts the SDK-standard
 * ANTHROPIC_API_KEY and the shorter ANTHROPIC_KEY (a very easy name to set by
 * mistake), so a mis-named env var doesn't silently leave the AI features off.
 */
export function anthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY || undefined;
}

export function anthropicConfigured(): boolean {
  return Boolean(anthropicApiKey());
}

/** Client with the key passed explicitly (the SDK only reads the standard name). */
export function anthropicClient(): Anthropic {
  return new Anthropic({ apiKey: anthropicApiKey() });
}
