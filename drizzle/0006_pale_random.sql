CREATE TYPE "public"."meeting_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."meeting_visibility" AS ENUM('private', 'workspace');--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by" text NOT NULL,
	"project_id" text,
	"title" text DEFAULT 'Meeting' NOT NULL,
	"visibility" "meeting_visibility" DEFAULT 'private' NOT NULL,
	"status" "meeting_status" DEFAULT 'uploading' NOT NULL,
	"audio_path" text,
	"mime" text,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"transcript" jsonb,
	"summary" jsonb,
	"action_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"engine" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meetings_ws_idx" ON "meetings" USING btree ("workspace_id","created_at");