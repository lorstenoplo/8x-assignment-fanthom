import "server-only";
import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

/** Lazy so importing this file never requires the key (build-time safety). */
export function gemini(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local.");
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export const MODELS = {
  live: process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
  text: process.env.GEMINI_TEXT_MODEL || "gemini-flash-latest",
  embedding: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
};

export class AiConfigError extends Error {}

export function assertConfigured() {
  if (!process.env.GEMINI_API_KEY) {
    throw new AiConfigError("GEMINI_API_KEY is missing. AI features are disabled until it is set.");
  }
}
