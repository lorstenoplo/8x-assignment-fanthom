import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireOwnMeeting } from "@/server/meeting-guard";
import { uploadRecording, isStorageConfigured } from "@/server/storage";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // ~500MB, generous for an hour-long call

/**
 * Receives the MediaRecorder blob captured client-side in the room and
 * uploads it to Vercel Blob. If storage isn't configured, the meeting
 * still saves — recording is treated as best-effort, and the UI shows
 * "no recording" rather than failing the whole call.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireOwnMeeting(id);
  if ("error" in guard) return guard.error;

  if (!isStorageConfigured()) {
    await db
      .update(schema.meetings)
      .set({
        recordingNote:
          "Recording storage is not configured (BLOB_READ_WRITE_TOKEN missing).",
      })
      .where(eq(schema.meetings.id, id));
    return NextResponse.json({
      stored: false,
      reason: "storage_not_configured",
    });
  }

  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = (await req.json()) as { url?: string; contentType?: string };
    if (!body.url || !body.url.startsWith("https://")) {
      return NextResponse.json(
        { error: "invalid_recording_url" },
        { status: 400 },
      );
    }
    await db
      .update(schema.meetings)
      .set({
        recordingUrl: body.url,
        recordingMime: body.contentType || "video/webm",
        recordingNote: null,
      })
      .where(eq(schema.meetings.id, id));
    return NextResponse.json({ stored: true, url: body.url });
  }

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const contentType = req.headers.get("content-type") || "video/webm";
  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) {
    return NextResponse.json({ stored: false, reason: "empty_upload" });
  }
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const result = await uploadRecording(id, buf, contentType);
  if ("error" in result) {
    console.error("recording upload failed", result.error);
    await db
      .update(schema.meetings)
      .set({ recordingNote: "Recording upload failed after the call ended." })
      .where(eq(schema.meetings.id, id));
    return NextResponse.json(
      { stored: false, reason: "upload_failed" },
      { status: 502 },
    );
  }

  await db
    .update(schema.meetings)
    .set({
      recordingUrl: result.url,
      recordingMime: contentType,
      recordingNote: null,
    })
    .where(eq(schema.meetings.id, id));
  return NextResponse.json({ stored: true, url: result.url });
}
