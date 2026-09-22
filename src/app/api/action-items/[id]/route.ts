import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireOwnMeeting } from "@/server/meeting-guard";

const PatchBody = z.object({ done: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await db.query.actionItems.findFirst({ where: eq(schema.actionItems.id, id) });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const guard = await requireOwnMeeting(existing.meetingId);
  if ("error" in guard) return guard.error;

  const body = PatchBody.parse(await req.json());
  const [item] = await db
    .update(schema.actionItems)
    .set({ done: body.done })
    .where(eq(schema.actionItems.id, id))
    .returning();
  return NextResponse.json({ item });
}
