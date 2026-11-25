CREATE TYPE "public"."grant_source" AS ENUM('jgrants', 'linkup');--> statement-breakpoint
CREATE TABLE "grant_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"source" "grant_source" NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"issuer" text,
	"url" text NOT NULL,
	"amount_max" bigint,
	"subsidy_rate" text,
	"deadline" timestamp with time zone,
	"area" text,
	"score" double precision DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grant_matches" ADD CONSTRAINT "grant_matches_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grant_matches_brief_source_ext" ON "grant_matches" USING btree ("brief_id","source","external_id");