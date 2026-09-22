import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq, isNull, and } from "drizzle-orm";
import { answerInCall } from "@/server/ai/agent-answer";
import { AiConfigError } from "@/server/ai/client";

const AskBody = z.object({
  question: z.string().min(1),
  atMs: z.number().int().nonnegative().default(0),
});

/**
 * The notetaker's answer path, hit only when the room's wake-word detector
 * (client-side, watching the live transcript for the configured name) fires.
 * `externalPresent` is derived server-side from who's actually still in the
 * room right now — never trusted from the client — so it can't be spoofed by
 * a compromised page into skipping the guard.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = AskBody.parse(await req.json());

  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id) });
  if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const stillPresent = await db.query.participants.findMany({
    where: and(eq(schema.participants.meetingId, id), isNull(schema.participants.leftAt)),
  });
  const externalPresent = stillPresent.some((p) => p.isExternal);
  const asker = stillPresent.find((p) => p.role === "host");

  try {
    const result = await answerInCall({
      meetingId: id,
      workspaceId: meeting.workspaceId,
      question: body.question,
      externalPresent,
      askerEmail: asker?.email ?? null,
      atMs: body.atMs,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiConfigError) {
      return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    }
    console.error("in-call ask error", err);
    return NextResponse.json({ error: "ask_failed" }, { status: 502 });
  }
}
