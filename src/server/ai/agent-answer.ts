import "server-only";
import { db, schema } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { gemini, MODELS } from "./client";
import { retrieve, toCitations, type RetrievedChunk } from "./retrieval";
import { guardAskMessage } from "./groq-guardrail";
import type { Citation } from "@/lib/db/schema";

export type AgentAnswerResult = {
  answer: string;
  blocked: boolean;
  blockReason?: string;
  citations: Citation[];
};

const REFUSAL =
  "I can't get into that with everyone on this call — happy to follow up with the host separately.";
const OFF_TOPIC_REFUSAL = "I'm just the notetaker for this call — I can only help with what's been discussed in your meetings.";
const GEN_TIMEOUT_MS = 12_000;

/**
 * Three independent guardrail layers, in order — deliberately not just "the
 * model was told to behave":
 *
 *  0. Scope/safety guard (Groq, a different vendor from the one that
 *     answers) — rejects anything that isn't actually a question about past
 *     meetings before an answer is even drafted. This is what stops someone
 *     mid-call from turning the notetaker into a general chatbot ("write me
 *     a for-loop", a jailbreak attempt, etc).
 *
 *  1. Retrieval filter (in `retrieve`) — with a guest present, chunks from
 *     confidential or unrelated internal meetings are never fetched, so they
 *     never enter the model's context at all. This is the layer that matters
 *     most for confidentiality: nothing the model wasn't given can leak.
 *
 *  2. Output check (here) — a second, cheap model call reviews the drafted
 *     answer against what's appropriate to say out loud in front of a guest,
 *     and can veto it even though every source chunk individually passed
 *     layer 1. Fails CLOSED: if this check errors or times out, the answer
 *     is blocked rather than spoken.
 *
 * Every call — allowed or blocked — is written to in_call_answers so the
 * guardrail is auditable, not just asserted.
 */
export async function answerInCall(params: {
  meetingId: string;
  workspaceId: string;
  question: string;
  externalPresent: boolean;
  askerEmail?: string | null;
  atMs: number;
}): Promise<AgentAnswerResult> {
  const scope = await guardAskMessage(params.question);
  if (scope.blocked) {
    await db.insert(schema.inCallAnswers).values({
      meetingId: params.meetingId,
      question: params.question,
      answer: OFF_TOPIC_REFUSAL,
      blocked: true,
      blockReason: scope.category ?? "out_of_scope",
      externalPresent: params.externalPresent,
      retrieved: [],
      atMs: params.atMs,
    });
    return { answer: OFF_TOPIC_REFUSAL, blocked: true, blockReason: scope.category, citations: [] };
  }

  const chunks = await retrieve(
    params.question,
    { workspaceId: params.workspaceId, externalPresent: params.externalPresent, askerEmail: params.askerEmail },
    6,
  );

  // Pulling in the current call's own transcript-so-far closes a real gap
  // (a decision made a minute ago in this same still-live call isn't
  // embedded yet, so `retrieve` alone can't see it) — but only when the
  // question actually references *this* call. Including it unconditionally
  // on every question was the real bug: it buried a genuinely relevant past
  // meeting (e.g. Dana's actual pricing discussion, which retrieval finds
  // fine on its own) under irrelevant noise from a call that has nothing to
  // do with what was asked. RAG across past meetings is the whole point of
  // this feature — someone can just scroll up for what was said just now.
  const referencesCurrentCall = /\b(this call|current call|current meeting|just now|just said|just decided|right now|earlier today|we just)\b/i.test(
    params.question,
  );
  let liveTranscript = "";
  if (referencesCurrentCall) {
    const liveSegments = await db.query.transcriptSegments.findMany({
      where: eq(schema.transcriptSegments.meetingId, params.meetingId),
      orderBy: [asc(schema.transcriptSegments.startMs)],
    });
    liveTranscript = liveSegments.map((s) => `${s.speaker}: ${s.text}`).join("\n");
  }

  let final: string;
  let blocked = false;
  let blockReason: string | undefined;

  try {
    const draft = await draftAnswer(params.question, chunks, liveTranscript);
    final = draft;

    if (params.externalPresent) {
      const verdict = await guardOutput(draft, params.question);
      if (!verdict.safe) {
        final = REFUSAL;
        blocked = true;
        blockReason = verdict.reason;
      }
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    final = isAbort ? "That took too long for me to answer — ask again in a moment." : REFUSAL;
    blocked = !isAbort; // a real generation error, in front of a guest, fails closed
    blockReason = isAbort ? "timeout" : "generation_error";
  }

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

  return { answer: final, blocked, blockReason, citations: blocked ? [] : citations };
}

async function draftAnswer(question: string, chunks: RetrievedChunk[], liveTranscript: string): Promise<string> {
  if (chunks.length === 0 && !liveTranscript.trim()) {
    return "I don't have anything on that from past meetings — nothing relevant came up.";
  }
  const pastContext = chunks.map((c) => `From "${c.meetingTitle}":\n${c.text}`).join("\n\n---\n\n");
  const context = [
    liveTranscript.trim() ? `From this current, still-ongoing meeting so far:\n${liveTranscript}` : null,
    pastContext || null,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const res = await gemini().models.generateContent({
    model: MODELS.text,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are the meeting notetaker, addressed by name mid-call. Answer the question in 1-3 short spoken sentences using only the context below — this includes what's already been said earlier in THIS same call, not just past meetings. If the context doesn't actually answer it, say so plainly rather than guessing.\n\nQuestion: ${question}\n\nContext:\n${context}`,
          },
        ],
      },
    ],
    // Missing `thinkingConfig` here was the actual cause of answers cutting
    // off mid-word ("The provided notes don") — this model reserves hidden
    // reasoning tokens out of `maxOutputTokens` by default, the same
    // truncation bug already fixed on every other Gemini call in this
    // codebase but missed on this one.
    config: {
      temperature: 0.2,
      // 300 was still cutting it close for a genuinely detailed answer —
      // with thinkingBudget at 0 none of this is wasted on hidden reasoning
      // anymore, so there's no real cost to giving it real headroom instead
      // of trying to guess a tight number that matches "1-3 sentences."
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
      abortSignal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    },
  });
  return res.text?.trim() || "I couldn't put together an answer for that.";
}

async function guardOutput(answer: string, question: string): Promise<{ safe: boolean; reason?: string }> {
  try {
    const res = await gemini().models.generateContent({
      model: MODELS.text,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `A meeting notetaker bot is about to say the ANSWER below out loud, live, in a call that includes at least one external guest (a client or outsider). Decide if it is safe to say in front of that guest.

Unsafe = it states specific internal numbers (revenue, pricing, headcount, valuations), names another client or deal by name, discloses internal-only strategy, or anything that reads as confidential business information not meant for an outsider.
Safe = general project status, publicly-shareable info, or a plain "I don't have that."

QUESTION: ${question}
ANSWER: ${answer}

Respond with strict JSON: {"safe": boolean, "reason": string}. reason is a short phrase naming what's unsafe about it, or "" if safe.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: { safe: { type: "boolean" }, reason: { type: "string" } },
          required: ["safe", "reason"],
        },
        temperature: 0,
        maxOutputTokens: 300,
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: AbortSignal.timeout(GEN_TIMEOUT_MS),
      },
    });
    const parsed = JSON.parse(res.text ?? "{}") as { safe: boolean; reason: string };
    return { safe: !!parsed.safe, reason: parsed.reason || undefined };
  } catch {
    // Fail closed: if the guard itself errors or times out, treat as unsafe.
    return { safe: false, reason: "guard_check_failed" };
  }
}
