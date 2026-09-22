/**
 * Seeds the demo workspace with real data, run through the actual product
 * pipeline — nothing here is a hardcoded summary or fake search result.
 * Requires GEMINI_API_KEY and DATABASE_URL to be set (summaries, action
 * items, and the retrieval index are all generated live via Gemini).
 *
 * Usage: npm run seed
 */
import "dotenv/config";
import { db, schema } from "../src/lib/db";
import { eq, and } from "drizzle-orm";
import { processMeeting } from "../src/server/meetings";
import { ALL_SEED_MEETINGS } from "./seed-data";

const ALERT_DEFS = [
  { name: "Pricing objections", query: "customer pushes back on price or asks for a discount", keywords: ["cheaper", "discount", "budget"] },
  { name: "Competitor mentioned", query: "a competing product or vendor is named", keywords: ["competitor"] },
  { name: "EU / data residency", query: "questions about data residency, GDPR, or where data is stored", keywords: ["EU", "residency", "GDPR"] },
];

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set — seeding needs it for summaries, action items, and the search index.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  console.log("Finding or creating the demo workspace…");
  let workspace = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.isDemo, true) });
  if (!workspace) {
    [workspace] = await db
      .insert(schema.workspaces)
      .values({
        name: "Fathom Clone (Demo)",
        ownerName: "Priya Nair",
        ownerEmail: "priya@fathomclone.dev",
        isDemo: true,
        onboardedAt: new Date(),
        autoRecord: true,
        shareWithAttendees: false,
        announceConsent: true,
        guardExternal: true,
        notetakerName: "Fathom",
        internalDomains: ["fathomclone.dev"],
        defaultTemplate: "general",
      })
      .returning();
  }
  console.log(`Demo workspace: ${workspace.id}`);

  console.log("Creating alerts…");
  for (const a of ALERT_DEFS) {
    const existing = await db.query.alerts.findFirst({
      where: and(eq(schema.alerts.workspaceId, workspace.id), eq(schema.alerts.name, a.name)),
    });
    if (!existing) {
      await db.insert(schema.alerts).values({ workspaceId: workspace.id, name: a.name, query: a.query, keywords: a.keywords });
    }
  }

  for (const seedMeeting of ALL_SEED_MEETINGS) {
    const existing = await db.query.meetings.findFirst({
      where: and(eq(schema.meetings.workspaceId, workspace.id), eq(schema.meetings.title, seedMeeting.title)),
    });
    if (existing) {
      console.log(`Skipping "${seedMeeting.title}" — already seeded.`);
      continue;
    }

    console.log(`Seeding "${seedMeeting.title}"…`);
    const startedAt = new Date(Date.now() - seedMeeting.daysAgo * 24 * 60 * 60 * 1000);
    const hadExternal = seedMeeting.participants.some((p) => p.isExternal);

    const [meeting] = await db
      .insert(schema.meetings)
      .values({
        workspaceId: workspace.id,
        title: seedMeeting.title,
        status: "live",
        startedAt,
        endedAt: new Date(startedAt.getTime() + seedMeeting.durationSec * 1000),
        durationSec: seedMeeting.durationSec,
        hadExternal,
        confidential: seedMeeting.confidential ?? false,
        source: "seed",
        consentAnnounced: true,
        recordingNote: "Seed data — this meeting was authored to demonstrate the product, not captured from a real call.",
      })
      .returning();

    await db.insert(schema.participants).values(
      seedMeeting.participants.map((p) => ({
        meetingId: meeting.id,
        name: p.name,
        email: p.email,
        role: p.role,
        isExternal: p.isExternal,
        joinedAt: startedAt,
        leftAt: new Date(startedAt.getTime() + seedMeeting.durationSec * 1000),
      })),
    );

    await db.insert(schema.transcriptSegments).values(
      seedMeeting.segments.map((s) => ({
        meetingId: meeting.id,
        speaker: s.speaker,
        startMs: s.startMs,
        endMs: s.endMs,
        text: s.text,
        isFinal: true,
      })),
    );

    if (seedMeeting.highlights) {
      await db.insert(schema.highlights).values(
        seedMeeting.highlights.map((h) => ({ meetingId: meeting.id, label: h.label, startMs: h.startMs, endMs: h.endMs })),
      );
    }

    console.log(`  Processing (summary, action items, index, alerts)…`);
    const { errors } = await processMeeting(meeting.id);
    if (errors.length > 0) console.warn(`  Warnings: ${errors.join("; ")}`);
  }

  console.log("\nDone. Set this in .env.local so signed-out visitors see the demo:\n");
  console.log(`DEMO_WORKSPACE_ID=${workspace.id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
