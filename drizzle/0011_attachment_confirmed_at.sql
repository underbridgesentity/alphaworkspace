-- Attachments are inserted BEFORE their bytes exist: beginUpload has to write
-- the row to hand back a signed PUT url. usedAttachmentBytes then summed every
-- row, including ones that never completed, with no cleanup. So any member
-- could call the endpoint in a loop declaring 25 MB a time, never upload, and
-- permanently exhaust the workspace's storage quota for everyone, with no
-- bytes stored and no way to reclaim it from the UI.
--
-- confirmed_at marks a row as a real file rather than a reservation. Quota and
-- listings count only confirmed rows; unconfirmed ones are swept by the
-- morning job.
--
-- Backfill: every existing row predates this column and represents a genuine
-- upload, so treat it as confirmed. Doing this as NULL would silently drop all
-- historical attachments out of listings and free their quota.

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "attachments" SET "confirmed_at" = "created_at" WHERE "confirmed_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_unconfirmed_idx"
  ON "attachments" ("created_at") WHERE "confirmed_at" IS NULL;
