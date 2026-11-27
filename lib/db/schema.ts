import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ── Enums ─────────────────────────────────────────────────────────── */
export const roleEnum = pgEnum("role", ["business", "student", "host"]);
export const briefStatusEnum = pgEnum("brief_status", [
  "draft",
  "enriching",
  "in_review",
  "approved",
  "rejected",
  "in_progress",
  "delivered",
  "evaluated",
]);
export const teamStatusEnum = pgEnum("team_status", ["pending", "approved", "rejected", "delivered"]);
export const sensitivityEnum = pgEnum("data_sensitivity", ["public", "private", "synthetic_ok"]);
export const groundingEnum = pgEnum("grounding_level", ["exact", "analog", "national", "ungrounded"]);
export const sourceKindEnum = pgEnum("source_kind", ["live", "synthetic"]);
export const providerEnum = pgEnum("source_provider", ["linkup", "adaption", "manual", "prebaked"]);
export const memberRoleEnum = pgEnum("member_role", ["lead", "member"]);
/** Team invitations: invitees join only after accepting (the creator/lead is accepted on creation). */
export const memberStatusEnum = pgEnum("member_status", ["invited", "accepted", "declined"]);
export const entityKindEnum = pgEnum("entity_kind", ["stakeholder", "venue", "funder"]);
export const subjectEnum = pgEnum("subject_type", ["brief", "team"]);
export const decisionEnum = pgEnum("decision", ["approve", "reject"]);

/* ── Shared JSON shapes ───────────────────────────────────────────── */
export type Bilingual = { ja: string; en: string };
export type BriefContent = {
  ja: { title: string; problem: string; current_process: string; desired_outcome: string };
  en: { title: string; problem: string; current_process: string; desired_outcome: string };
};
export type AiReview = {
  recommendation: "approve" | "revise" | "reject" | null;
  score?: number;
  issues?: string[];
  pii_found?: boolean;
  grounding_comment?: string;
  error?: string;
};

/** Mirrors SyntheticPayload in lib/datasets/store.ts (kept here so the schema has no app imports). */
export type SyntheticPayloadJson = {
  name: string;
  generatedBy: "adaption" | "prebaked" | "seed";
  externalId?: string | null;
  groundedOn: { title: string; url: string }[];
  rows: { prompt: string; completion: string }[];
};

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ── Tables ───────────────────────────────────────────────────────── */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  role: roleEnum("role"),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  locale: text("locale").notNull().default("ja"),
  skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  ...timestamps,
});

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  name: text("name").notNull(),
  city: text("city").notNull(),
  ward: text("ward"),
  industry: text("industry").notNull(),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  ...timestamps,
});

export const briefs = pgTable("briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id),
  elevenlabsConversationId: text("elevenlabs_conversation_id").unique(),
  transcript: text("transcript"),
  content: jsonb("content").$type<BriefContent>().notNull(),
  sourceLanguage: text("source_language").notNull().default("ja"),
  toolsUsed: text("tools_used").array().notNull().default(sql`'{}'::text[]`),
  hoursLostPerWeek: numeric("hours_lost_per_week", { precision: 5, scale: 1, mode: "number" }),
  skillsNeeded: text("skills_needed").array().notNull().default(sql`'{}'::text[]`),
  dataSensitivity: sensitivityEnum("data_sensitivity").notNull().default("synthetic_ok"),
  groundingLevel: groundingEnum("grounding_level"),
  status: briefStatusEnum("status").notNull().default("draft"),
  aiReview: jsonb("ai_review").$type<AiReview>(),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  ...timestamps,
});

export const dataSources = pgTable("data_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  briefId: uuid("brief_id")
    .notNull()
    .references(() => briefs.id, { onDelete: "cascade" }),
  kind: sourceKindEnum("kind").notNull(),
  provider: providerEnum("provider").notNull(),
  groundingLevel: groundingEnum("grounding_level"),
  matchedCity: text("matched_city"),
  title: text("title").notNull(),
  url: text("url"),
  snippet: text("snippet"),
  license: text("license"),
  /** For synthetic sets: the live data_sources rows this set was generated from. */
  groundedOn: uuid("grounded_on").array().notNull().default(sql`'{}'::uuid[]`),
  /** For synthetic sets: the stand-in payload itself (DB-backed; works on read-only serverless FS). */
  payload: jsonb("payload").$type<SyntheticPayloadJson>(),
  /** @deprecated Legacy relative path of an on-disk JSON payload. No longer written; read as fallback only. */
  payloadPath: text("payload_path"),
  /** True when served from pre-baked reference data instead of a live call. */
  isReference: boolean("is_reference").notNull().default(false),
  /** Adaption Labs dataset id, when the set came from (or is still generating in) Adaption. */
  externalId: text("external_id"),
  /** True while Adaption Labs is still generating; payload is fetched lazily. */
  pending: boolean("pending").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  briefId: uuid("brief_id")
    .notNull()
    .references(() => briefs.id),
  name: text("name").notNull(),
  pitch: text("pitch").notNull(),
  status: teamStatusEnum("status").notNull().default("pending"),
  aiReview: jsonb("ai_review").$type<AiReview>(),
  ...timestamps,
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: memberRoleEnum("role").notNull().default("member"),
    status: memberStatusEnum("status").notNull().default("invited"),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    // Exactly one lead per team.
    uniqueIndex("team_one_lead").on(t.teamId).where(sql`${t.role} = 'lead'`),
  ],
);

export const deliveries = pgTable("deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id),
  briefId: uuid("brief_id")
    .notNull()
    .references(() => briefs.id),
  summary: jsonb("summary").$type<Bilingual>().notNull(),
  links: text("links").array().notNull().default(sql`'{}'::text[]`),
  handoverNotes: text("handover_notes"),
  supportContactUserId: uuid("support_contact_user_id")
    .notNull()
    .references(() => users.id),
  supportUntil: date("support_until").notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
});

export const feedbackTokens = pgTable("feedback_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliveryId: uuid("delivery_id")
    .notNull()
    .references(() => deliveries.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  sentToEmail: text("sent_to_email"),
  emailDelivered: boolean("email_delivered").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evaluations = pgTable("evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliveryId: uuid("delivery_id")
    .notNull()
    .unique()
    .references(() => deliveries.id),
  hoursSavedPerWeek: numeric("hours_saved_per_week", { precision: 5, scale: 1, mode: "number" }).notNull(),
  satisfaction: integer("satisfaction").notNull(),
  stillInUse: boolean("still_in_use").notNull(),
  issues: text("issues"),
  wouldRecommend: boolean("would_recommend").notNull(),
  impactConversationId: text("impact_conversation_id").unique(),
  impactTranscript: text("impact_transcript"),
  impactSummary: jsonb("impact_summary").$type<Record<string, unknown>>(),
  /** Owner ticked "May we quote you publicly?" on the written form. Testimonials require it. */
  quoteConsent: boolean("quote_consent").notNull().default(false),
  /** Set when the owner withdraws the quote (signed link or "Delete my data"); hides it from testimonials. */
  quoteWithdrawnAt: timestamp("quote_withdrawn_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entities = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: entityKindEnum("kind").notNull(),
  name: jsonb("name").$type<Bilingual>().notNull(),
  city: text("city").notNull(),
  ward: text("ward"),
  industries: text("industries").array().notNull().default(sql`'{}'::text[]`),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
});

export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: subjectEnum("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  decidedBy: uuid("decided_by")
    .notNull()
    .references(() => users.id),
  decision: decisionEnum("decision").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const serviceEvents = pgTable("service_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  service: text("service").notNull(),
  operation: text("operation").notNull(),
  ok: boolean("ok").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Open public funding programmes matched to a brief (lib/grants). Replaced on each refresh. */
export const grantSourceEnum = pgEnum("grant_source", ["jgrants", "linkup"]);

export const grantMatches = pgTable(
  "grant_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => briefs.id, { onDelete: "cascade" }),
    source: grantSourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    issuer: text("issuer"),
    url: text("url").notNull(),
    amountMax: bigint("amount_max", { mode: "number" }),
    subsidyRate: text("subsidy_rate"),
    deadline: timestamp("deadline", { withTimezone: true }),
    area: text("area"),
    score: doublePrecision("score").notNull().default(0),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("grant_matches_brief_source_ext").on(t.briefId, t.source, t.externalId)],
);

/** "Bring any team" (coming soon) waitlist from the landing page. One row per email. */
export const waitlist = pgTable("waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  org: text("org"),
  role: text("role").notNull(),
  locale: text("locale").notNull(),
  /** Roadmap features the signer cares about: "team" | "pm" | "points" (lib/party.ts). */
  features: text("features").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── Events (hackathons, charrettes, test kitchens) — lib/events ──── */
export const eventFormatEnum = pgEnum("event_format", ["hackathon", "charrette", "test_kitchen"]);
export const eventStatusEnum = pgEnum("event_status", ["draft", "published", "cancelled"]);
export const rsvpRoleEnum = pgEnum("rsvp_role", ["participant", "mentor", "owner", "observer"]);
export const rsvpStatusEnum = pgEnum("rsvp_status", ["going", "waitlist", "cancelled"]);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: jsonb("title").$type<Bilingual>().notNull(),
  summary: jsonb("summary").$type<Bilingual>().notNull(),
  format: eventFormatEnum("format").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull().default("Asia/Tokyo"),
  city: text("city").notNull(),
  venueName: text("venue_name").notNull(),
  venueAddress: text("venue_address").notNull(),
  onlineUrl: text("online_url"),
  capacity: integer("capacity").notNull(),
  status: eventStatusEnum("status").notNull().default("draft"),
  hostUserId: uuid("host_user_id").references(() => users.id, { onDelete: "set null" }),
  coverImage: text("cover_image"),
  /** Demo/sample event created by scripts/seed-events.ts (shown with a "demo" badge). */
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
});

export const eventChallenges = pgTable(
  "event_challenges",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => briefs.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.briefId] })],
);

export const eventRsvps = pgTable(
  "event_rsvps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: rsvpRoleEnum("role").notNull().default("participant"),
    status: rsvpStatusEnum("status").notNull().default("going"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("event_rsvps_event_user").on(t.eventId, t.userId)],
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type EventRsvp = typeof eventRsvps.$inferSelect;
export type EventFormat = (typeof eventFormatEnum.enumValues)[number];
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type RsvpRole = (typeof rsvpRoleEnum.enumValues)[number];
export type RsvpStatus = (typeof rsvpStatusEnum.enumValues)[number];

export type User = typeof users.$inferSelect;
export type Business = typeof businesses.$inferSelect;
export type Brief = typeof briefs.$inferSelect;
export type DataSource = typeof dataSources.$inferSelect;
export type NewDataSource = typeof dataSources.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
export type Evaluation = typeof evaluations.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type GrantMatchRow = typeof grantMatches.$inferSelect;
export type NewGrantMatchRow = typeof grantMatches.$inferInsert;
export type BriefStatus = (typeof briefStatusEnum.enumValues)[number];
export type TeamStatus = (typeof teamStatusEnum.enumValues)[number];
export type MemberStatus = (typeof memberStatusEnum.enumValues)[number];
export type GroundingLevel = (typeof groundingEnum.enumValues)[number];
