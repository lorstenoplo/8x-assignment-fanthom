/**
 * Looks for the notetaker's name at or near the start of an utterance, and
 * returns everything after it as the question. Deliberately loose (case-
 * insensitive, optional "hey"/"ok" prefix) since this is matched against
 * live speech transcription, which is never going to be punctuation-perfect.
 */
export function extractWakeWordQuestion(text: string, wakeWord: string): string | null {
  const escaped = wakeWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*(hey|ok|okay)?[,]?\\s*${escaped}[,]?\\s*(.*)$`, "i");
  const match = text.match(pattern);
  if (!match) return null;
  const question = match[2]?.trim();
  return question && question.length > 2 ? question : null;
}
