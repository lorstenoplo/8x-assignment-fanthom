import "server-only";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { gemini, MODELS } from "./client";
import type { TranscriptSegment, SummaryContent } from "@/lib/db/schema";
import { TEMPLATES, type TemplateId } from "./templates";

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One sentence, what this meeting was." },
    purpose: { type: "string", description: "1-2 sentences on why the meeting happened." },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          bullets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                startMs: {
                  type: "integer",
                  description: "Timestamp in ms this bullet is grounded in, from the transcript's [mm:ss] markers.",
                },
              },
              required: ["text"],
            },
          },
        },
        required: ["heading", "bullets"],
      },
    },
  },
  required: ["headline", "purpose", "sections"],
};

const ACTION_ITEMS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          assignee: { type: "string", description: "Name mentioned as owner, or empty string if unclear." },
          dueHint: { type: "string", description: "Any deadline mentioned in the words used, or empty string." },
          startMs: { type: "integer" },
        },
        required: ["text", "startMs"],
      },
    },
  },
  required: ["items"],
};

function transcriptForPrompt(segments: TranscriptSegment[]): string {
  return segments
    .filter((s) => s.isFinal)
    .map((s) => `[${msToTag(s.startMs)}] ${s.speaker}: ${s.text}`)
    .join("\n");
}

function msToTag(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function loadTranscript(meetingId: string) {
  const segments = await db.query.transcriptSegments.findMany({
    where: eq(schema.transcriptSegments.meetingId, meetingId),
    orderBy: (t, { asc }) => asc(t.startMs),
  });
  if (segments.length === 0) {
    throw new Error("Meeting has no transcript yet — nothing to summarise.");
  }
  return segments;
}

export async function generateSummary(meetingId: string, template: TemplateId): Promise<SummaryContent> {
  const segments = await loadTranscript(meetingId);
  const transcript = transcriptForPrompt(segments);
  const spec = TEMPLATES[template];

  const res = await gemini().models.generateContent({
    model: MODELS.text,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${spec.instruction}\n\nEvery bullet must be grounded in something actually said — set startMs to the [mm:ss] timestamp (converted to milliseconds) of the line it comes from. Do not invent facts not present in the transcript. If the call is short or thin, it is fine to have few bullets.\n\nTranscript:\n${transcript}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: SUMMARY_SCHEMA,
      temperature: 0.3,
    },
  });

  const parsed = JSON.parse(res.text ?? "{}") as SummaryContent;
  await db
    .insert(schema.summaries)
    .values({ meetingId, template, content: parsed, model: MODELS.text })
    .onConflictDoUpdate({
      target: [schema.summaries.meetingId, schema.summaries.template],
      set: { content: parsed, model: MODELS.text, createdAt: new Date() },
    });
  return parsed;
}

export async function getOrCreateSummary(meetingId: string, template: TemplateId): Promise<SummaryContent> {
  const existing = await db.query.summaries.findFirst({
    where: and(eq(schema.summaries.meetingId, meetingId), eq(schema.summaries.template, template)),
  });
  if (existing) return existing.content;
  return generateSummary(meetingId, template);
}

export async function generateActionItems(meetingId: string) {
  const segments = await loadTranscript(meetingId);
  const transcript = transcriptForPrompt(segments);

  const res = await gemini().models.generateContent({
    model: MODELS.text,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Extract concrete action items from this meeting transcript — things someone explicitly committed to doing, not general discussion topics. If there truly are none, return an empty list; do not invent items to fill space. Use the [mm:ss] timestamp of the line the commitment was made in, converted to milliseconds, for startMs.\n\nTranscript:\n${transcript}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: ACTION_ITEMS_SCHEMA,
      temperature: 0.2,
    },
  });

  const parsed = JSON.parse(res.text ?? "{}") as {
    items: { text: string; assignee?: string; dueHint?: string; startMs: number }[];
  };

  await db.delete(schema.actionItems).where(eq(schema.actionItems.meetingId, meetingId));
  if (parsed.items.length === 0) return [];

  return db
    .insert(schema.actionItems)
    .values(
      parsed.items.map((i) => ({
        meetingId,
        text: i.text,
        assignee: i.assignee || null,
        dueHint: i.dueHint || null,
        startMs: i.startMs,
      })),
    )
    .returning();
}
