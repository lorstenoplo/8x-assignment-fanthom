import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getViewingWorkspaceId } from "@/server/session";
import { retrieve, toCitations } from "@/server/ai/retrieval";
import { gemini, MODELS, AiConfigError } from "@/server/ai/client";

const AskBody = z.object({
  threadId: z.string().min(1),
  message: z.string().min(1),
});

/** Account-level "Ask" — chat across every past meeting in the workspace. */
export async function POST(req: Request) {
  const workspaceId = await getViewingWorkspaceId();
  const body = AskBody.parse(await req.json());

  await db.insert(schema.askMessages).values({
    workspaceId,
    threadId: body.threadId,
    role: "user",
    content: body.message,
  });

  try {
    const chunks = await retrieve(body.message, { workspaceId }, 8);
    const history = await db.query.askMessages.findMany({
      where: eq(schema.askMessages.threadId, body.threadId),
      orderBy: (t, { asc }) => asc(t.createdAt),
      limit: 20,
    });

    const context = chunks.map((c) => `From "${c.meetingTitle}":\n${c.text}`).join("\n\n---\n\n");
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
              text: `You answer questions about the user's past meetings using only the context provided. Cite which meeting each fact comes from by name. If nothing in the context answers the question, say so.\n\n${conversation ? `Earlier in this conversation:\n${conversation}\n\n` : ""}Context from past meetings:\n${context || "(no matching meetings found)"}\n\nQuestion: ${body.message}`,
            },
          ],
        },
      ],
      config: { temperature: 0.3 },
    });

    const answer = res.text?.trim() || "I couldn't find anything relevant in past meetings.";
    const citations = toCitations(chunks);

    const [saved] = await db
      .insert(schema.askMessages)
      .values({ workspaceId, threadId: body.threadId, role: "assistant", content: answer, citations })
      .returning();

    return NextResponse.json({ message: saved });
  } catch (err) {
    if (err instanceof AiConfigError) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    console.error("ask error", err);
    return NextResponse.json({ error: "ask_failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const workspaceId = await getViewingWorkspaceId();
  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ messages: [] });
  const messages = await db.query.askMessages.findMany({
    where: eq(schema.askMessages.threadId, threadId),
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
  // Defence in depth: threadId is a UUID the client generated, but never trust
  // it alone — confirm every message actually belongs to this workspace.
  const filtered = messages.filter((m) => m.workspaceId === workspaceId);
  return NextResponse.json({ messages: filtered });
}
