import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

const PatchBody = z.object({ done: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = PatchBody.parse(await req.json());
  const [item] = await db
    .update(schema.actionItems)
    .set({ done: body.done })
    .where(eq(schema.actionItems.id, id))
    .returning();
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ item });
}
