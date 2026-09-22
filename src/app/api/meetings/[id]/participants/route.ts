import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { requireOwnMeeting } from "@/server/meeting-guard";

const JoinBody = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().max(200).optional(),
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
  const guard = await requireOwnMeeting(id);
  if ("error" in guard) return guard.error;

  const body = JoinBody.parse(await req.json());
  const workspace = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, guard.meeting.workspaceId) });

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

const LeaveBody = z.object({ participantId: z.string().max(100), talkTimeSec: z.number().int().nonnegative().max(24 * 3600).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnMeeting(id);
  if ("error" in guard) return guard.error;

  const body = LeaveBody.parse(await req.json());
  await db
    .update(schema.participants)
    .set({ leftAt: new Date(), ...(body.talkTimeSec != null ? { talkTimeSec: body.talkTimeSec } : {}) })
    .where(and(eq(schema.participants.id, body.participantId), eq(schema.participants.meetingId, id)));
  return NextResponse.json({ ok: true });
}
