import "server-only";
import { put } from "@vercel/blob";

/** Recording storage: Vercel Blob. */
export function isStorageConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function uploadRecording(
  meetingId: string,
  buf: ArrayBuffer,
  contentType: string,
): Promise<{ url: string } | { error: string }> {
  if (!isStorageConfigured()) return { error: "not_configured" };
  try {
    const blob = await put(`recordings/${meetingId}.webm`, buf, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    return { url: blob.url };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
