import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { getViewingWorkspaceIds } from "@/server/session";
import { retrieve, toCitations } from "@/server/ai/retrieval";
import { gemini, MODELS, AiConfigError } from "@/server/ai/client";
import { guardAskMessage } from "@/server/ai/groq-guardrail";
import { rateLimit, clientKey } from "@/server/rate-limit";
import type { AskUiBlock } from "@/lib/db/schema";

const AskBody = z.object({
  threadId: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
  /** Attach-a-meeting: scope this turn's retrieval to one meeting instead of the whole workspace. */
  scopeMeetingId: z.string().max(100).optional(),
});

const GEN_TIMEOUT_MS = 20_000;
/** A thread with no assistant reply after this long is treated as failed, not "still processing". */
const STALE_LOCK_MS = 45_000;

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    markdown: {
      type: "string",
      description:
        "The answer, formatted as markdown (lists, bold, short headings where useful). Cite meetings by name inline.",
    },
    meetingCards: {
      type: "array",
      description:
        "Meetings worth surfacing as a card, when the answer centers on one or more specific meetings.",
      items: {
        type: "object",
        properties: {
          meetingId: { type: "string" },
          title: { type: "string" },
          startMs: { type: "integer" },
        },
        required: ["meetingId", "title"],
      },
    },
    actionItemsBlock: {
      type: "array",
      description:
        "Populate only when the user specifically asked about action items / open tasks / who owns what.",
      items: {
        type: "object",
        properties: { text: { type: "string" }, assignee: { type: "string" } },
        required: ["text"],
      },
    },
  },
  required: ["markdown"],
};

const REFUSAL_MARKDOWN =
  "I can only help with questions about your own meetings, or how this app works — that one's outside what I can answer here.";

export async function POST(req: Request) {
  const workspaceIds = await getViewingWorkspaceIds();
  const workspaceId = workspaceIds[0];
  const body = AskBody.parse(await req.json());

  const { allowed } = rateLimit(
    `ask:${clientKey(req, workspaceId)}`,
    20,
    60 * 1000,
  );
  if (!allowed)
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  // Concurrency guard: don't let a second message on the same thread start
  // generating while the first hasn't gotten its reply yet. Checked against
  // the DB (not in-memory) so it holds even across separate serverless
  // instances. A thread stuck mid-generation past STALE_LOCK_MS is treated
  // as failed rather than blocking the user forever.
  const [lastMessage] = await db.query.askMessages.findMany({
    where: eq(schema.askMessages.threadId, body.threadId),
    orderBy: [desc(schema.askMessages.createdAt)],
    limit: 1,
  });
  if (
    lastMessage?.role === "user" &&
    Date.now() - lastMessage.createdAt.getTime() < STALE_LOCK_MS
  ) {
    return NextResponse.json({ error: "already_processing" }, { status: 429 });
  }

  await db.insert(schema.askMessages).values({
    workspaceId,
    threadId: body.threadId,
    role: "user",
    content: body.message,
  });

  const guard = await guardAskMessage(body.message);
  if (guard.blocked) {
    const [saved] = await db
      .insert(schema.askMessages)
      .values({
        workspaceId,
        threadId: body.threadId,
        role: "assistant",
        content: REFUSAL_MARKDOWN,
        guardBlocked: true,
      })
      .returning();
    return NextResponse.json({ message: saved });
  }

  try {
    const chunks = await retrieve(
      body.message,
      { workspaceId: workspaceIds, scopeMeetingId: body.scopeMeetingId },
      8,
    );
    const history = await db.query.askMessages.findMany({
      where: eq(schema.askMessages.threadId, body.threadId),
      orderBy: (t, { asc }) => asc(t.createdAt),
      limit: 20,
    });

    const context = chunks
      .map((c) => `From "${c.meetingTitle}" (id: ${c.meetingId}):\n${c.text}`)
      .join("\n\n---\n\n");
    const conversation = history
      .slice(0, -1)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const res = await gemini().models.generateContent({
      model: MODELS.text,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You answer questions about the user's past meetings using only the context provided. Cite which meeting each fact comes from by name in the markdown. If nothing in the context answers the question, say so plainly instead of guessing.\n\n${conversation ? `Earlier in this conversation:\n${conversation}\n\n` : ""}Context from past meetings:\n${context || "(no matching meetings found)"}\n\nQuestion: ${body.message}`,
            },
          ],
        },
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 1500,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: ANSWER_SCHEMA,
        abortSignal: AbortSignal.timeout(GEN_TIMEOUT_MS),
      },
    });

    const parsed = JSON.parse(res.text ?? "{}") as {
      markdown?: string;
      meetingCards?: { meetingId: string; title: string; startMs?: number }[];
      actionItemsBlock?: { text: string; assignee?: string }[];
    };
    const markdown =
      parsed.markdown?.trim() ||
      "I couldn't find anything relevant in past meetings.";

    const blocks: AskUiBlock[] = [];
    for (const card of parsed.meetingCards ?? []) {
      blocks.push({
        type: "meeting_card",
        meetingId: card.meetingId,
        title: card.title,
        dateLabel: "",
        startMs: card.startMs,
      });
    }
    if (parsed.actionItemsBlock?.length) {
      blocks.push({ type: "action_items", items: parsed.actionItemsBlock });
    }

    const citations = toCitations(chunks);

    const [saved] = await db
      .insert(schema.askMessages)
      .values({
        workspaceId,
        threadId: body.threadId,
        role: "assistant",
        content: markdown,
        citations,
        blocks,
      })
      .returning();

    return NextResponse.json({ message: saved });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    // Record a visible failure rather than leaving the thread silently
    // "stuck processing" from the client's perspective.
    const failText = isAbort
      ? "That took too long to answer — try a more specific question."
      : "Something went wrong answering that.";
    const [saved] = await db
      .insert(schema.askMessages)
      .values({
        workspaceId,
        threadId: body.threadId,
        role: "assistant",
        content: failText,
      })
      .returning();

    if (err instanceof AiConfigError)
      return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    console.error("ask error", err);
    return NextResponse.json(
      { message: saved },
      { status: isAbort ? 504 : 500 },
    );
  }
}

export async function GET(req: Request) {
  const workspaceIds = await getViewingWorkspaceIds();
  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ messages: [] });
  const messages = await db.query.askMessages.findMany({
    where: eq(schema.askMessages.threadId, threadId),
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
  // Defence in depth: threadId is a UUID the client generated, but never trust
  // it alone — confirm every message actually belongs to this workspace.
  const filtered = messages.filter((m) => workspaceIds.includes(m.workspaceId));
  return NextResponse.json({ messages: filtered });
}
