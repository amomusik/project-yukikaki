CREATE TYPE "public"."event_format" AS ENUM('hackathon', 'charrette', 'test_kitchen');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rsvp_role" AS ENUM('participant', 'mentor', 'owner', 'observer');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('going', 'waitlist', 'cancelled');--> statement-breakpoint
CREATE TABLE "event_challenges" (
	"event_id" uuid NOT NULL,
	"brief_id" uuid NOT NULL,
	CONSTRAINT "event_challenges_event_id_brief_id_pk" PRIMARY KEY("event_id","brief_id")
);
--> statement-breakpoint
CREATE TABLE "event_rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "rsvp_role" DEFAULT 'participant' NOT NULL,
	"status" "rsvp_status" DEFAULT 'going' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"format" "event_format" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Tokyo' NOT NULL,
	"city" text NOT NULL,
	"venue_name" text NOT NULL,
	"venue_address" text NOT NULL,
	"online_url" text,
	"capacity" integer NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"host_user_id" uuid,
	"cover_image" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "event_challenges" ADD CONSTRAINT "event_challenges_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_challenges" ADD CONSTRAINT "event_challenges_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvps_event_user" ON "event_rsvps" USING btree ("event_id","user_id");