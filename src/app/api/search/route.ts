import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewingWorkspaceId } from "@/server/session";
import { retrieve } from "@/server/ai/retrieval";
import { AiConfigError } from "@/server/ai/client";
import { rateLimit, clientKey } from "@/server/rate-limit";

const Query = z.object({ q: z.string().min(1).max(500) });
const TIMEOUT_MS = 15_000;

/**
 * Semantic search over transcripts + summaries via the shared retrieval
 * chokepoint. Run outside any call, by the workspace owner browsing their own
 * meetings, so the guard is off (ctx.externalPresent unset) — same rule as Ask.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({ q: url.searchParams.get("q") || "" });
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  const workspaceId = await getViewingWorkspaceId();
  const { allowed } = rateLimit(`search:${clientKey(req, workspaceId)}`, 30, 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  try {
    const results = await Promise.race([
      retrieve(parsed.data.q, { workspaceId }, 12),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof AiConfigError) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    console.error("search error", err);
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }
}
