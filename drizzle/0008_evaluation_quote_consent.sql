ALTER TABLE "evaluations" ADD COLUMN "quote_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "quote_withdrawn_at" timestamp with time zone;