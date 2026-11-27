CREATE TYPE "public"."member_status" AS ENUM('invited', 'accepted', 'declined');--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "status" "member_status" DEFAULT 'invited' NOT NULL;--> statement-breakpoint
-- Leads created their team, so they are accepted. Existing non-lead members were added without
-- consent and stay 'invited' until they accept (pnpm seed re-creates demo members as accepted).
UPDATE "team_members" SET "status" = 'accepted' WHERE "role" = 'lead';
