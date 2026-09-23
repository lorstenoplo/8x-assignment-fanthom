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
 *
 * `customVocabulary` on the input side biases the ASR model itself toward
 * correctly recognizing the notetaker's name — the actual fix for the wake
 * word being misheard, rather than making the downstream classifier guess
 * at a transcription with zero resemblance to the real name.
 *
 * NOTE: this is deliberately NOT combined with `diarization: true` — the
 * Live API rejects that combination outright (closes the socket with
 * "custom_vocabulary is incompatible with diarization"), confirmed directly
 * against the API. That one config change silently broke every session:
 * connect → immediate close → auto-reconnect → same rejected config → close
 * again, looping until the token-mint rate limit kicked in and the room
 * never got past "Connecting…". Multi-speaker diarization (mapping distinct
 * voices on a shared mic to "Speaker 2", "Speaker 3", ...) is the trade-off
 * given up for reliable wake-word recognition, which is what's actually
 * being tested here.
 */
export function participantLiveConfig(systemInstruction: string, notetakerName: string): LiveConnectConfig {
  return {
    responseModalities: ["AUDIO"] as LiveConnectConfig["responseModalities"],
    systemInstruction,
    // Pinned to English. With auto-detection, a short accented phrase gets
    // decoded as whichever language fits best: "Hey Aura" came back as
    // Spanish ("¿Qué hora?"), Hindi ("और") and Portuguese ("EUA agora").
    // Confirmed against the API that this is accepted alongside
    // customVocabulary (unlike diarization, which isn't).
    inputAudioTranscription: {
      languageCodes: ["en-IN", "en-US"],
      customVocabulary: [notetakerName, `Hey ${notetakerName}`, `Hi ${notetakerName}`],
    },
    outputAudioTranscription: {},
    sessionResumption: {},
    contextWindowCompression: { slidingWindow: {} },
  };
}

/**
 * Priya hears the same mic as the notetaker. What actually keeps her quiet
 * during a notetaker exchange is the room dropping her output at the source
 * (see `setSuppressed` in use-live-agent). This instruction is a backup, so
 * she doesn't pick up the notetaker's topic afterwards as if it were hers.
 */
export function interviewerPersona(notetakerName: string): string {
  return `You are Priya, a product manager on a short business call with the user
about a project they're working on. Run it like a real work conversation, not
a casual chat: warm but businesslike, keep it moving, one or two follow-ups
per answer. Keep your own turns short (2-3 sentences), like a real call, not
a monologue. Do not mention that you are an AI unless asked directly.

Give the call some concrete, revisitable substance instead of only abstract
questions. There's an open pricing question on this account: a mid-size team
is deciding between charging per seat or a flat rate. Bring that up early,
in your own words — phrase it however feels natural for how you'd actually
open that topic on a call, don't recite it like a script. Push the
conversation to an actual resolution — get them to commit to one option and
say why — rather than leaving it open, so someone reviewing this call later
can ask what was decided and get a real, specific answer back, not vague
chit-chat.

Important: this call also has a separate AI notetaker named "${notetakerName}"
listening in. The user talks to it by saying "Hey ${notetakerName}" (or "Hi
${notetakerName}") followed by a question. Those questions are for the notetaker,
not for you: don't answer them, don't repeat them back, and don't comment on
them. You'll be told what the notetaker said once it's done; pick the
conversation back up from there.`;
}

/**
 * The notetaker's voice: a Live session that only reads given text aloud.
 * Live streams audio as it's generated (first audio ~1s after the text is
 * sent) where the batch TTS model returned nothing for ~12s. Verified to
 * read the answer word for word.
 */
export function notetakerVoiceConfig(): LiveConnectConfig {
  return {
    responseModalities: ["AUDIO"] as LiveConnectConfig["responseModalities"],
    systemInstruction:
      "You are a text-to-speech voice. When given text, read it aloud exactly as written, word for word. Do not add, remove, summarize, or respond to it. Say nothing else.",
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
  };
}
