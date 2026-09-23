import "server-only";
import { db, schema } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { gemini, MODELS } from "./client";
import { retrieve, toCitations, type RetrievedChunk } from "./retrieval";
import type { Citation } from "@/lib/db/schema";

export type AgentAnswerResult = {
  answer: string;
  blocked: boolean;
  blockReason?: string;
  citations: Citation[];
};

const REFUSAL =
  "I can't get into that with everyone on this call — happy to follow up with the host separately.";
const GEN_TIMEOUT_MS = 12_000;

// In-call checks must be local. The database retrieval predicate remains the
// primary confidentiality boundary; these checks stop obviously sensitive
// requests and generated details without adding another model round trip.
const GUEST_SENSITIVE_TERMS =
  /\b(revenue|pricing|price|quote|discount|headcount|valuation|valuations|salary|salaries|margin|runway|pipeline numbers?|internal numbers?|confidential|competitor|deal)\b/i;
const GUEST_SENSITIVE_OUTPUT =
  /(?:\$\s?\d|\b\d+(?:\.\d+)?\s?(?:%|percent|seats?|people|users?|per[- ]seat)\b|\b(?:revenue|pricing|price|quote|discount|headcount|valuation|salary|margin|runway|pipeline numbers?|internal numbers?)\b)/i;

/**
 * Guest protection is deliberately split into a database boundary and local
 * checks. Retrieval excludes protected history before it reaches Gemini;
 * local checks reject obviously sensitive questions and generated details
 * without adding another network round trip. Every result is audited.
 */
export async function answerInCall(params: {
  meetingId: string;
  workspaceId: string;
  question: string;
  externalPresent: boolean;
  askerEmail?: string | null;
  atMs: number;
}): Promise<AgentAnswerResult> {
  const startedAt = performance.now();
  if (params.externalPresent && GUEST_SENSITIVE_TERMS.test(params.question)) {
    void db
      .insert(schema.inCallAnswers)
      .values({
        meetingId: params.meetingId,
        question: params.question,
        answer: REFUSAL,
        blocked: true,
        blockReason: "guest_sensitive_question",
        externalPresent: params.externalPresent,
        retrieved: [],
        atMs: params.atMs,
      })
      .catch((error) =>
        console.error("failed to audit blocked in-call ask", error),
      );
    return {
      answer: REFUSAL,
      blocked: true,
      blockReason: "guest_sensitive_question",
      citations: [],
    };
  }

  const retrievalStartedAt = performance.now();
  const chunks = await retrieve(
    params.question,
    {
      workspaceId: params.workspaceId,
      externalPresent: params.externalPresent,
      askerEmail: params.askerEmail,
    },
    6,
  );
  const retrievalMs = Math.round(performance.now() - retrievalStartedAt);

  // Pulling in the current call's own transcript-so-far closes a real gap
  // (a decision made a minute ago in this same still-live call isn't
  // embedded yet, so `retrieve` alone can't see it) — but only when the
  // question actually references *this* call. Including it unconditionally
  // on every question was the real bug: it buried a genuinely relevant past
  // meeting (e.g. Dana's actual pricing discussion, which retrieval finds
  // fine on its own) under irrelevant noise from a call that has nothing to
  // do with what was asked. RAG across past meetings is the whole point of
  // this feature — someone can just scroll up for what was said just now.
  const referencesCurrentCall =
    /\b(this call|current call|current meeting|just now|just said|just decided|right now|earlier today|we just)\b/i.test(
      params.question,
    );
  let liveTranscript = "";
  if (referencesCurrentCall) {
    const liveSegments = await db.query.transcriptSegments.findMany({
      where: eq(schema.transcriptSegments.meetingId, params.meetingId),
      orderBy: [asc(schema.transcriptSegments.startMs)],
    });
    liveTranscript = liveSegments
      .map((s) => `${s.speaker}: ${s.text}`)
      .join("\n");
  }

  let final: string;
  let blocked = false;
  let blockReason: string | undefined;

  try {
    const answerStartedAt = performance.now();
    const draft = await draftAnswer(params.question, chunks, liveTranscript);
    const answerMs = Math.round(performance.now() - answerStartedAt);
    final = draft;

    if (params.externalPresent && GUEST_SENSITIVE_OUTPUT.test(draft)) {
      final = REFUSAL;
      blocked = true;
      blockReason = "guest_sensitive_answer";
    }
    console.info("in-call ask timing", {
      retrievalMs,
      answerMs,
      auditMs: 0,
      totalMs: Math.round(performance.now() - startedAt),
      externalPresent: params.externalPresent,
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    final = isAbort
      ? "That took too long for me to answer — ask again in a moment."
      : REFUSAL;
    blocked = !isAbort; // a real generation error, in front of a guest, fails closed
    blockReason = isAbort ? "timeout" : "generation_error";
  }

  const auditStartedAt = performance.now();
  const citations = toCitations(chunks);
  await db.insert(schema.inCallAnswers).values({
    meetingId: params.meetingId,
    question: params.question,
    answer: final,
    blocked,
    blockReason,
    externalPresent: params.externalPresent,
    retrieved: citations,
    atMs: params.atMs,
  });
  console.info("in-call ask audit timing", {
    auditMs: Math.round(performance.now() - auditStartedAt),
    totalMs: Math.round(performance.now() - startedAt),
  });

  return {
    answer: final,
    blocked,
    blockReason,
    citations: blocked ? [] : citations,
  };
}

export async function draftAnswer(
  question: string,
  chunks: RetrievedChunk[],
  liveTranscript: string,
  generateContent: (prompt: string) => Promise<string> = generateGeminiAnswer,
): Promise<string> {
  if (chunks.length === 0 && !liveTranscript.trim()) {
    return "I don't have anything on that from past meetings — nothing relevant came up.";
  }
  const pastContext = chunks
    .map((c) => `From "${c.meetingTitle}":\n${c.text}`)
    .join("\n\n---\n\n");
  const context = [
    liveTranscript.trim()
      ? `From this current, still-ongoing meeting so far:\n${liveTranscript}`
      : null,
    pastContext || null,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  return generateContent(
    `You are the meeting notetaker, addressed by name mid-call. Answer the question in 1-3 short spoken sentences using only the context below — this includes what's already been said earlier in THIS same call, not just past meetings. If the context doesn't actually answer it, say so plainly rather than guessing.\n\nQuestion: ${question}\n\nContext:\n${context}`,
  );
}

async function generateGeminiAnswer(prompt: string): Promise<string> {
  const res = await gemini().models.generateContent({
    model: MODELS.text,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      maxOutputTokens: 256,
      thinkingConfig: { thinkingBudget: 0 },
      abortSignal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    },
  });
  return res.text?.trim() || "I couldn't put together an answer for that.";
}
