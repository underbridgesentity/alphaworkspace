/**
 * WhatsApp "doorbell" channel — DELIBERATELY NOT IMPLEMENTED in Phase 1.
 *
 * The wider vision (Phase 3) allows an outbound-only nudge:
 *   "New task assigned in Alpha. Open: <deep link>"
 * sent via a Meta WhatsApp Business utility template, gated by an org-level
 * opt-in (workspaces.settings.whatsappDoorbell, default false — the setting
 * placeholder already exists).
 *
 * Product laws this must never violate when it ships:
 *  - Outbound only. Never two-way. Replies are not read, processed, or
 *    acknowledged; WhatsApp is never an input surface (Law 1).
 *  - One utility template with a deep link into the app. No content beyond
 *    the doorbell ring (Law 2 — anti-noise).
 *
 * Shipping it later is an adapter change, not an architecture change:
 * implement `send()` below with the Meta Cloud API, register the adapter in
 * ./index.ts behind the org setting + env credentials, and add the template
 * id/env vars. Nothing outside this folder should need to change.
 */
import type { ChannelAdapter } from "./index";

export const whatsappChannel: ChannelAdapter = {
  async send() {
    return "skipped:not-implemented";
  },
};
