/**
 * The one public contact address, in one place.
 *
 * It is published on /support, /delete-account and /privacy, and it is what
 * both store listings give as the support contact. It lived as three separate
 * constants in those three pages, which is the shape a stale address takes:
 * change two, miss one, and a store listing points at a mailbox nobody reads.
 *
 * WHY THE UNDERBRIDGES ADDRESS AND NOT support@alphaworkspace.co.za: neither
 * store requires the support address to sit on the app's own domain. Apple
 * wants a reachable Support URL with a way to contact a human, Play wants a
 * support email on the listing, and this satisfies both while being a mailbox
 * that already exists and is already read. A product-specific alias can be
 * added later by pointing this constant at it; nothing else has to change.
 *
 * It must stay a real, monitored inbox. Apple emails it during review.
 */
export const SUPPORT_EMAIL = "info@underbridges.co.za";

/** `mailto:` form, so call sites do not each rebuild the string. */
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
