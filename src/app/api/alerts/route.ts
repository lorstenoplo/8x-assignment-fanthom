import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getViewingWorkspaceId, ensureWorkspace } from "@/server/session";

const CreateAlert = z.object({
  name: z.string().min(1),
  query: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  threshold: z.number().min(0).max(1).default(0.62),
});

export async function GET() {
  const workspaceId = await getViewingWorkspaceId();
  const list = await db.query.alerts.findMany({
    where: eq(schema.alerts.workspaceId, workspaceId),
    orderBy: (t, { desc }) => desc(t.createdAt),
  });
  const hits = await db.query.alertHits.findMany({
    where: (t, { inArray }) => inArray(t.alertId, list.map((a) => a.id).length ? list.map((a) => a.id) : ["-"]),
    orderBy: (t, { desc }) => desc(t.createdAt),
  });
  return NextResponse.json({ alerts: list, hits });
}

export async function POST(req: Request) {
  const workspaceId = await ensureWorkspace();
  const body = CreateAlert.parse(await req.json());
  const [alert] = await db
    .insert(schema.alerts)
    .values({ workspaceId, name: body.name, query: body.query, keywords: body.keywords, threshold: body.threshold })
    .returning();
  return NextResponse.json({ alert });
}
