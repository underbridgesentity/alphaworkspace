-- Authorship columns become nullable and SET NULL, so deleting an account is
-- actually possible.
--
-- THE BUG THIS FIXES
-- deleteAccount() ends in `DELETE FROM users`, and seven columns referenced
-- users.id with no ON DELETE behaviour and a NOT NULL constraint. Postgres
-- therefore refused the delete for any user who had ever created a project,
-- created a task, written a comment, sent an invite, defined a KPI or entered
-- a KPI value in a workspace that outlived them. That is nearly every real
-- member, so "delete my account" failed for exactly the people who ask for it:
-- departing employees. POPIA gives them that right, and both app stores test
-- it before they will approve a listing.
--
-- WHY SET NULL AND NOT CASCADE
-- These columns attribute workspace-owned content to a person. The content
-- belongs to the team: cascading would delete a departing member's tasks and
-- comments out of their colleagues' project history, destroying the workspace
-- owner's records to satisfy one member's deletion. SET NULL keeps the work
-- and drops the name, which is the honest reading of both obligations. The
-- reader-facing half is "Former member".
--
-- READERS MUST LEFT JOIN. An inner join from comments to users silently drops
-- every comment whose author is now null, which loses the thread rather than
-- the name. listTask() and appendComment() were both inner joins and are
-- fixed in the same change; tests/account-deletion.test.ts pins it.
--
-- Note the two kpi_* columns were already nullable and only lacked the ON
-- DELETE clause, so they get no DROP NOT NULL below.
--
-- Existing rows are untouched: ON DELETE SET NULL governs future deletes only.

ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_author_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "invites" DROP CONSTRAINT IF EXISTS "invites_invited_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "kpi_definitions" DROP CONSTRAINT IF EXISTS "kpi_definitions_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "kpi_entries" DROP CONSTRAINT IF EXISTS "kpi_entries_entered_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "workspaces_created_by_users_id_fk";--> statement-breakpoint

ALTER TABLE "comments" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "invited_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint

ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_entries" ADD CONSTRAINT "kpi_entries_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
