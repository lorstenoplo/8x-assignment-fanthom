import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { isNull, and, desc, eq } from "drizzle-orm";
import { answerInCall } from "@/server/ai/agent-answer";
import { AiConfigError } from "@/server/ai/client";
import { requireOwnMeeting } from "@/server/meeting-guard";
import { getViewingWorkspaceIds } from "@/server/session";

const AskBody = z.object({
  question: z.string().min(1).max(1000),
  atMs: z
    .number()
    .int()
    .nonnegative()
    .max(24 * 60 * 60 * 1000)
    .default(0),
});

/** Blocks rapid-fire repeats of the wake word (retries, echo, a stuck client) from stacking up paid model calls. */
const MIN_GAP_MS = 3_000;

/**
 * The notetaker's answer path, hit only when the room's wake-word detector
 * (client-side, watching the live transcript for the configured name) fires.
 * `externalPresent` is derived server-side from who's actually still in the
 * room right now — never trusted from the client — so it can't be spoofed by
 * a compromised page into skipping the guard.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireOwnMeeting(id);
  if ("error" in guard) return guard.error;

  const body = AskBody.parse(await req.json());

  const [lastAnswer] = await db.query.inCallAnswers.findMany({
    where: eq(schema.inCallAnswers.meetingId, id),
    orderBy: [desc(schema.inCallAnswers.createdAt)],
    limit: 1,
  });
  if (lastAnswer && Date.now() - lastAnswer.createdAt.getTime() < MIN_GAP_MS) {
    return NextResponse.json({ error: "too_soon" }, { status: 429 });
  }

  const stillPresent = await db.query.participants.findMany({
    where: and(
      eq(schema.participants.meetingId, id),
      isNull(schema.participants.leftAt),
    ),
  });
  const externalPresent = stillPresent.some((p) => p.isExternal);
  const asker = stillPresent.find((p) => p.role === "host");
  const viewingWorkspaceIds = await getViewingWorkspaceIds();

  try {
    const result = await answerInCall({
      meetingId: id,
      workspaceId: viewingWorkspaceIds,
      question: body.question,
      externalPresent,
      askerEmail: asker?.email ?? null,
      atMs: body.atMs,
    });
    // Text only. Speech is streamed separately by the room's own Live voice
    // session: the batch TTS model took ~21s to render ~15s of speech,
    // which pushed this request past the client's timeout.
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiConfigError) {
      return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    }
    console.error("in-call ask error", err);
    return NextResponse.json({ error: "ask_failed" }, { status: 502 });
  }
}
