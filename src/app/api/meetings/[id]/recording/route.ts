import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * Receives the MediaRecorder blob captured client-side in the room and
 * uploads it to Vercel Blob. If BLOB_READ_WRITE_TOKEN isn't set, the meeting
 * still saves — recording is treated as best-effort, and the UI shows
 * "no recording" rather than failing the whole call.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id) });
  if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    await db
      .update(schema.meetings)
      .set({ recordingNote: "Recording storage is not configured (BLOB_READ_WRITE_TOKEN missing)." })
      .where(eq(schema.meetings.id, id));
    return NextResponse.json({ stored: false, reason: "blob_not_configured" });
  }

  const contentType = req.headers.get("content-type") || "video/webm";
  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) {
    return NextResponse.json({ stored: false, reason: "empty_upload" });
  }

  try {
    const blob = await put(`recordings/${id}.webm`, buf, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    await db
      .update(schema.meetings)
      .set({ recordingUrl: blob.url, recordingMime: contentType, recordingNote: null })
      .where(eq(schema.meetings.id, id));
    return NextResponse.json({ stored: true, url: blob.url });
  } catch (err) {
    console.error("recording upload failed", err);
    await db
      .update(schema.meetings)
      .set({ recordingNote: "Recording upload failed after the call ended." })
      .where(eq(schema.meetings.id, id));
    return NextResponse.json({ stored: false, reason: "upload_failed" }, { status: 502 });
  }
}
