import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewingWorkspaceId } from "@/server/session";
import { retrieve } from "@/server/ai/retrieval";
import { AiConfigError } from "@/server/ai/client";

const Query = z.object({ q: z.string().min(1) });

/**
 * Semantic search over transcripts + summaries via the shared retrieval
 * chokepoint. Run outside any call, by the workspace owner browsing their own
 * meetings, so the guard is off (ctx.externalPresent unset) — same rule as Ask.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const { q } = Query.parse({ q: url.searchParams.get("q") || "" });
  const workspaceId = await getViewingWorkspaceId();

  try {
    const results = await retrieve(q, { workspaceId }, 12);
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof AiConfigError) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    console.error("search error", err);
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }
}
