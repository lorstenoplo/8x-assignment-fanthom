import type { LiveConnectConfig } from "@google/genai";

/**
 * Config for the "other participant" Live session — the one voice in the test
 * room that actually talks back. Audio-only response (audio+video sessions on
 * the Live API cap at ~2 minutes; audio-only gets 15), with both directions
 * transcribed so we get a speaker-attributed transcript for free instead of
 * running a separate STT pass over the recording.
 *
 * Session resumption + context compression are on because a single socket
 * only lasts ~10 minutes; the client reconnects using the resumption handle
 * before that expires and the user never sees a gap.
 */
export function participantLiveConfig(systemInstruction: string): LiveConnectConfig {
  return {
    responseModalities: ["AUDIO"] as LiveConnectConfig["responseModalities"],
    systemInstruction,
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
    contextWindowCompression: { slidingWindow: {} },
  };
}

export const INTERVIEWER_PERSONA = `You are Priya, a product manager taking a short discovery call with the
user about a project they're working on. You are warm, curious, and keep the
conversation moving — ask about what they're building, who it's for, what's
hard about it right now, and one or two follow-ups per answer. Keep your own
turns short (2-3 sentences), like a real call, not a monologue. This is a two
to five minute call, so get to substantive questions quickly. Do not mention
that you are an AI unless asked directly.`;
