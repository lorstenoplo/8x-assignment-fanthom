import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ensureWorkspace } from "@/server/session";
import { eq } from "drizzle-orm";
import { rateLimit, clientKey } from "@/server/rate-limit";

const CreateBody = z.object({
  title: z.string().min(1).max(200).default("Untitled meeting"),
});

/** Starts a meeting: creates the row and the host participant, room-side. */
export async function POST(req: Request) {
  const workspaceId = await ensureWorkspace();

  const { allowed } = rateLimit(`create-meeting:${clientKey(req, workspaceId)}`, 10, 10 * 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = CreateBody.parse(await req.json().catch(() => ({})));

  const workspace = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });

  const [meeting] = await db
    .insert(schema.meetings)
    .values({ workspaceId, title: body.title, status: "live", source: "room" })
    .returning();

  await db.insert(schema.participants).values({
    meetingId: meeting.id,
    name: workspace?.ownerName || "You",
    email: workspace?.ownerEmail || null,
    role: "host",
    isExternal: false,
  });

  return NextResponse.json({ meeting });
}
