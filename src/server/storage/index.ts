import "server-only";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "recordings";

/**
 * Recording storage. Originally targeted Vercel Blob, but Vercel folded Blob
 * into its storage marketplace and no longer offers it as a standalone
 * product — Supabase Storage is what's actually one-click-connectable from
 * the Vercel dashboard now, is S3-compatible, and has a generous free tier,
 * so it replaces Blob here rather than adding a fourth cloud vendor (e.g.
 * GCS) for one feature.
 */
function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // Service-role key: server-only, bypasses row-level security. Never sent
  // to the browser — recordings are uploaded through our own API route.
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isStorageConfigured() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function uploadRecording(
  meetingId: string,
  buf: ArrayBuffer,
  contentType: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = client();
  if (!supabase) return { error: "not_configured" };

  const path = `${meetingId}.webm`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType,
    upsert: true,
  });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}
