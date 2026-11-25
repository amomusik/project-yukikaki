CREATE TYPE "public"."brief_status" AS ENUM('draft', 'enriching', 'in_review', 'approved', 'rejected', 'in_progress', 'delivered', 'evaluated');--> statement-breakpoint
CREATE TYPE "public"."decision" AS ENUM('approve', 'reject');--> statement-breakpoint
CREATE TYPE "public"."entity_kind" AS ENUM('stakeholder', 'venue', 'funder');--> statement-breakpoint
CREATE TYPE "public"."grounding_level" AS ENUM('exact', 'analog', 'national', 'ungrounded');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('lead', 'member');--> statement-breakpoint
CREATE TYPE "public"."source_provider" AS ENUM('linkup', 'adaption', 'manual', 'prebaked');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('business', 'student', 'host');--> statement-breakpoint
CREATE TYPE "public"."data_sensitivity" AS ENUM('public', 'private', 'synthetic_ok');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('live', 'synthetic');--> statement-breakpoint
CREATE TYPE "public"."subject_type" AS ENUM('brief', 'team');--> statement-breakpoint
CREATE TYPE "public"."team_status" AS ENUM('pending', 'approved', 'rejected', 'delivered');--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"business_id" uuid NOT NULL,
	"elevenlabs_conversation_id" text,
	"transcript" text,
	"content" jsonb NOT NULL,
	"source_language" text DEFAULT 'ja' NOT NULL,
	"tools_used" text[] DEFAULT '{}'::text[] NOT NULL,
	"hours_lost_per_week" integer,
	"skills_needed" text[] DEFAULT '{}'::text[] NOT NULL,
	"data_sensitivity" "data_sensitivity" DEFAULT 'synthetic_ok' NOT NULL,
	"grounding_level" "grounding_level",
	"status" "brief_status" DEFAULT 'draft' NOT NULL,
	"ai_review" jsonb,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "briefs_elevenlabs_conversation_id_unique" UNIQUE("elevenlabs_conversation_id")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"ward" text,
	"industry" text NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"provider" "source_provider" NOT NULL,
	"grounding_level" "grounding_level",
	"matched_city" text,
	"title" text NOT NULL,
	"url" text,
	"snippet" text,
	"license" text,
	"grounded_on" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"payload_path" text,
	"is_reference" boolean DEFAULT false NOT NULL,
	"external_id" text,
	"pending" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"decided_by" uuid NOT NULL,
	"decision" "decision" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"brief_id" uuid NOT NULL,
	"summary" jsonb NOT NULL,
	"links" text[] DEFAULT '{}'::text[] NOT NULL,
	"handover_notes" text,
	"support_contact_user_id" uuid NOT NULL,
	"support_until" date NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "entity_kind" NOT NULL,
	"name" jsonb NOT NULL,
	"city" text NOT NULL,
	"ward" text,
	"industries" text[] DEFAULT '{}'::text[] NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"hours_saved_per_week" integer NOT NULL,
	"satisfaction" integer NOT NULL,
	"still_in_use" boolean NOT NULL,
	"issues" text,
	"would_recommend" boolean NOT NULL,
	"impact_conversation_id" text,
	"impact_transcript" text,
	"impact_summary" jsonb,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_delivery_id_unique" UNIQUE("delivery_id"),
	CONSTRAINT "evaluations_impact_conversation_id_unique" UNIQUE("impact_conversation_id")
);
--> statement-breakpoint
CREATE TABLE "feedback_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"sent_to_email" text,
	"email_delivered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "service_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"operation" text NOT NULL,
	"ok" boolean NOT NULL,
	"latency_ms" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pitch" text NOT NULL,
	"status" "team_status" DEFAULT 'pending' NOT NULL,
	"ai_review" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"role" "role",
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"locale" text DEFAULT 'ja' NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."briefs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_support_contact_user_id_users_id_fk" FOREIGN KEY ("support_contact_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_tokens" ADD CONSTRAINT "feedback_tokens_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."briefs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_one_lead" ON "team_members" USING btree ("team_id") WHERE "team_members"."role" = 'lead';