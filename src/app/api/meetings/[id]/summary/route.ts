import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateSummary, generateSummary } from "@/server/ai/summarize";
import { TEMPLATE_IDS, type TemplateId } from "@/server/ai/templates";
import { AiConfigError } from "@/server/ai/client";
import { requireOwnMeeting, requireViewableMeeting } from "@/server/meeting-guard";

const TemplateSchema = z.enum(TEMPLATE_IDS as [TemplateId, ...TemplateId[]]);

/** Viewable by the owner or via the public demo — but still gated, since a miss here means an
 * arbitrary visitor could trigger a paid generation call against a guessed meeting id. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireViewableMeeting(id);
  if ("error" in guard) return guard.error;

  const url = new URL(req.url);
  const template = TemplateSchema.parse(url.searchParams.get("template") || "general");
  try {
    const content = await getOrCreateSummary(id, template);
    return NextResponse.json({ content, template });
  } catch (err) {
    if (err instanceof AiConfigError) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    console.error("summary fetch error", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** Force-regenerate a template's summary — restricted to the meeting's own workspace, even for the demo. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnMeeting(id);
  if ("error" in guard) return guard.error;

  const body = z.object({ template: TemplateSchema.default("general") }).parse(await req.json().catch(() => ({})));
  try {
    const content = await generateSummary(id, body.template);
    return NextResponse.json({ content, template: body.template });
  } catch (err) {
    if (err instanceof AiConfigError) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    console.error("summary regen error", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
