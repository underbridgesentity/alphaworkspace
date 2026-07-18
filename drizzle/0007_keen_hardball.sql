ALTER TABLE "meetings" ADD COLUMN "source" text DEFAULT 'device' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "bot_id" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "bot_status" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "speaker_names" jsonb;--> statement-breakpoint
CREATE INDEX "meetings_bot_idx" ON "meetings" USING btree ("bot_id");