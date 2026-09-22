import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** gemini-embedding-001 is asked for 768 dims: inside pgvector's HNSW limit. */
export const EMBEDDING_DIMENSIONS = 768;

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * A workspace is what a cookie points at. There is no login: the signed cookie
 * carries the workspace id, and every query is scoped by it.
 */
export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull().default("My workspace"),
  ownerName: text("owner_name").notNull().default("You"),
  ownerEmail: text("owner_email"),
  /** Set once onboarding is completed; null means show the walkthrough. */
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  isDemo: boolean("is_demo").notNull().default(false),

  // ── preferences, set in onboarding, enforced in the room ──────────────────
  /** Arm recording automatically when a meeting starts. */
  autoRecord: boolean("auto_record").notNull().default(true),
  /** Send the recap to every attendee, vs only when you explicitly share. */
  shareWithAttendees: boolean("share_with_attendees").notNull().default(false),
  /** Announce the recording out loud and show a consent banner (GDPR). */
  announceConsent: boolean("announce_consent").notNull().default(true),
  /** Block the in-call agent from answering while a guest is present. */
  guardExternal: boolean("guard_external").notNull().default(true),
  /** What you must say to summon the notetaker. */
  notetakerName: text("notetaker_name").notNull().default("Fathom"),
  /** Domains treated as internal; everyone else is a guest. */
  internalDomains: jsonb("internal_domains").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  defaultTemplate: text("default_template").notNull().default("general"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meetings = pgTable(
  "meetings",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** live → processing → ready. failed carries processingError. */
    status: text("status").notNull().default("live"),
    processingError: text("processing_error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSec: integer("duration_sec").notNull().default(0),

    recordingUrl: text("recording_url"),
    recordingMime: text("recording_mime"),
    /** Recording was never captured (mic denied, upload failed, seeded). */
    recordingNote: text("recording_note"),

    /** True if any participant was external. Drives retrieval filtering. */
    hadExternal: boolean("had_external").notNull().default(false),
    /** Never retrievable while a guest is in the room, regardless of anything else. */
    confidential: boolean("confidential").notNull().default(false),

    /** 'room' = captured here, 'seed' = demo data. */
    source: text("source").notNull().default("room"),
    consentAnnounced: boolean("consent_announced").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meetings_workspace_idx").on(t.workspaceId, t.startedAt),
    index("meetings_status_idx").on(t.status),
  ],
);

export const participants = pgTable(
  "participants",
  {
    id: id(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    /** host | guest | agent */
    role: text("role").notNull().default("guest"),
    isExternal: boolean("is_external").notNull().default(false),
    talkTimeSec: integer("talk_time_sec").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [index("participants_meeting_idx").on(t.meetingId)],
);

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: id(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    speaker: text("speaker").notNull(),
    participantId: text("participant_id"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    /** Live captions arrive partial; only final segments are indexed. */
    isFinal: boolean("is_final").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("segments_meeting_idx").on(t.meetingId, t.startMs)],
);

export const summaries = pgTable(
  "summaries",
  {
    id: id(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    template: text("template").notNull(),
    /** { purpose, sections: [{heading, bullets:[{text, startMs}]}], nextSteps } */
    content: jsonb("content").$type<SummaryContent>().notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("summaries_meeting_template_idx").on(t.meetingId, t.template)],
);

export type SummaryBullet = { text: string; startMs: number | null };
export type SummarySection = { heading: string; bullets: SummaryBullet[] };
export type SummaryContent = {
  headline: string;
  purpose: string;
  sections: SummarySection[];
};

export const actionItems = pgTable(
  "action_items",
  {
    id: id(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    assignee: text("assignee"),
    dueHint: text("due_hint"),
    done: boolean("done").notNull().default(false),
    /** Where in the call it was said, so the item can deep-link back. */
    startMs: integer("start_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("action_items_meeting_idx").on(t.meetingId)],
);

export const highlights = pgTable(
  "highlights",
  {
    id: id(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("Highlight"),
    note: text("note"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    /** Marked live during the call, or after the fact from playback. */
    createdDuringCall: boolean("created_during_call").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("highlights_meeting_idx").on(t.meetingId, t.startMs)],
);

/**
 * One row per share link. scope 'meeting' shares the whole call; scope 'clip'
 * shares a range, which is how you send a moment to someone who was not there.
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    scope: text("scope").notNull().default("meeting"),
    title: text("title"),
    startMs: integer("start_ms"),
    endMs: integer("end_ms"),
    /** Hide the full transcript from recipients; summary + clip only. */
    hideTranscript: boolean("hide_transcript").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    views: integer("views").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("share_links_meeting_idx").on(t.meetingId)],
);

/**
 * Retrieval unit. A chunk carries the access facts of the meeting it came from,
 * copied at write time, so the filter runs in SQL rather than after the fact.
 */
export const chunks = pgTable(
  "chunks",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    speakers: jsonb("speakers").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    /** Denormalised from the meeting: the guard reads these, not a join. */
    hadExternal: boolean("had_external").notNull().default(false),
    confidential: boolean("confidential").notNull().default(false),
    /** Emails of everyone in that meeting, so we can check "were you there?". */
    attendeeEmails: jsonb("attendee_emails").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    tokens: integer("tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chunks_workspace_idx").on(t.workspaceId),
    index("chunks_meeting_idx").on(t.meetingId),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** What to watch for, in plain language. Matched semantically. */
    query: text("query").notNull(),
    /** Optional literal terms; a hit on either counts. */
    keywords: jsonb("keywords").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    threshold: real("threshold").notNull().default(0.62),
    active: boolean("active").notNull().default(true),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alerts_workspace_idx").on(t.workspaceId)],
);

export const alertHits = pgTable(
  "alert_hits",
  {
    id: id(),
    alertId: text("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id").references(() => chunks.id, { onDelete: "cascade" }),
    snippet: text("snippet").notNull(),
    score: real("score").notNull(),
    startMs: integer("start_ms").notNull().default(0),
    matchedOn: text("matched_on").notNull().default("semantic"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("alert_hits_alert_idx").on(t.alertId, t.createdAt),
    uniqueIndex("alert_hits_unique_idx").on(t.alertId, t.chunkId),
  ],
);

/** Ask, the account-level chat. Threads are per workspace. */
export const askMessages = pgTable(
  "ask_messages",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<Citation[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ask_messages_thread_idx").on(t.threadId, t.createdAt)],
);

export type Citation = {
  meetingId: string;
  meetingTitle: string;
  startMs: number;
  snippet: string;
};

/**
 * Every question the in-call agent was asked, what it retrieved, and whether the
 * guard blocked it. This is the audit trail that makes the guardrail checkable
 * instead of a claim.
 */
export const inCallAnswers = pgTable(
  "in_call_answers",
  {
    id: id(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    blocked: boolean("blocked").notNull().default(false),
    blockReason: text("block_reason"),
    /** Guests present at the moment of asking. */
    externalPresent: boolean("external_present").notNull().default(false),
    retrieved: jsonb("retrieved").$type<Citation[]>().notNull().default(sql`'[]'::jsonb`),
    atMs: integer("at_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("in_call_answers_meeting_idx").on(t.meetingId, t.createdAt)],
);

export type Workspace = typeof workspaces.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type TranscriptSegment = typeof transcriptSegments.$inferSelect;
export type Summary = typeof summaries.$inferSelect;
export type ActionItem = typeof actionItems.$inferSelect;
export type Highlight = typeof highlights.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type AlertHit = typeof alertHits.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
