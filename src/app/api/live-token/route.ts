import { NextResponse } from "next/server";
import { gemini, MODELS, assertConfigured, AiConfigError } from "@/server/ai/client";
import { participantLiveConfig, INTERVIEWER_PERSONA } from "@/server/ai/live-config";

/**
 * Mints a short-lived, single-use Live API token so the browser can open the
 * WebSocket directly to Gemini. The real API key never reaches the client.
 * `lockAdditionalFields` pins the persona and modalities into the token
 * itself, so a compromised client token can't be replayed with a different
 * system prompt.
 */
export async function POST() {
  try {
    assertConfigured();
    const token = await gemini().authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: MODELS.live,
          config: participantLiveConfig(INTERVIEWER_PERSONA),
        },
        lockAdditionalFields: ["systemInstruction", "responseModalities"],
      },
    });
    return NextResponse.json({ token: token.name, model: MODELS.live });
  } catch (err) {
    if (err instanceof AiConfigError) {
      return NextResponse.json({ error: "ai_not_configured", message: err.message }, { status: 503 });
    }
    console.error("live-token error", err);
    return NextResponse.json({ error: "token_mint_failed" }, { status: 502 });
  }
}
