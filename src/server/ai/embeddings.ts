import "server-only";
import { gemini, MODELS } from "./client";
import { EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

/**
 * Batches to stay well under the API's per-request item limit and to keep any
 * single failure from discarding an entire meeting's worth of chunks.
 */
const BATCH_SIZE = 32;

export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await gemini().models.embedContent({
      model: MODELS.embedding,
      contents: batch,
      config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    const embeddings = res.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Embedding count mismatch: sent ${batch.length}, got ${embeddings.length} back.`,
      );
    }
    for (const e of embeddings) {
      const values = e.values ?? [];
      if (values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dim embedding, got ${values.length}.`);
      }
      out.push(values);
    }
  }
  return out;
}

export async function embedText(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  const [v] = await embedTexts([text], taskType);
  return v;
}
