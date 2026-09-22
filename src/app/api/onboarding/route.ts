import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@/server/session";

const OnboardBody = z.object({
  ownerName: z.string().min(1).max(80),
  autoRecord: z.boolean(),
  shareWithAttendees: z.boolean(),
  announceConsent: z.boolean(),
  guardExternal: z.boolean(),
  notetakerName: z.string().min(1).max(40),
  internalDomains: z.array(z.string()).default([]),
  defaultTemplate: z.enum(["general", "sales", "one_on_one", "standup"]).default("general"),
});

export async function POST(req: Request) {
  const workspaceId = await ensureWorkspace();
  const body = OnboardBody.parse(await req.json());

  const [workspace] = await db
    .update(schema.workspaces)
    .set({ ...body, onboardedAt: new Date() })
    .where(eq(schema.workspaces.id, workspaceId))
    .returning();

  return NextResponse.json({ workspace });
}
