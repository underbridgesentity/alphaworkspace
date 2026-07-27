/**
 * Plain numeric limits shared by the browser and the server.
 *
 * Deliberately dependency-free. These used to live in validators.ts, and a
 * client component importing one number dragged zod plus every API schema
 * into the bundle (measured at 70 KB gzipped on the meetings route, which is
 * most of a second on 3G). Anything a client component needs as a VALUE
 * belongs here; validators.ts imports from this file so the caps stay one
 * source of truth.
 */

/**
 * Hard caps regardless of plan: 2 hours, 50 MB. The byte cap mirrors the
 * storage bucket's Supabase Free-tier ceiling (see server/storage.ts); an
 * in-app recording (32 kbps opus) reaches ~29 MB at the 2 hour mark.
 */
export const MEETING_MAX_SECONDS = 7_200;
export const MEETING_MAX_BYTES = 52_428_800;
