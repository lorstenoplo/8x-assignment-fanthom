import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

const JoinBody = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  role: z.enum(["host", "guest", "agent"]).default("guest"),
});

function isExternal(email: string | undefined, internalDomains: string[]) {
  if (!email) return true; // no email given => can't confirm internal, treat as guest
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;
  return !internalDomains.some((d) => d.toLowerCase() === domain);
}

/**
 * A participant joining mid-call. This is the guardrail's most important
 * trigger: the moment `isExternal` flips true for the room, retrieval must
 * narrow on the very next question, not just at call start.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = JoinBody.parse(await req.json());

  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id) });
  if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const workspace = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, meeting.workspaceId) });

  const external = body.role === "agent" ? false : isExternal(body.email, workspace?.internalDomains ?? []);

  const [participant] = await db
    .insert(schema.participants)
    .values({ meetingId: id, name: body.name, email: body.email, role: body.role, isExternal: external })
    .returning();

  if (external) {
    await db.update(schema.meetings).set({ hadExternal: true }).where(eq(schema.meetings.id, id));
  }

  return NextResponse.json({ participant });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await db.query.participants.findMany({ where: eq(schema.participants.meetingId, id) });
  return NextResponse.json({ participants: list });
}

const LeaveBody = z.object({ participantId: z.string(), talkTimeSec: z.number().int().nonnegative().optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = LeaveBody.parse(await req.json());
  await db
    .update(schema.participants)
    .set({ leftAt: new Date(), ...(body.talkTimeSec != null ? { talkTimeSec: body.talkTimeSec } : {}) })
    .where(and(eq(schema.participants.id, body.participantId), eq(schema.participants.meetingId, id)));
  return NextResponse.json({ ok: true });
}
