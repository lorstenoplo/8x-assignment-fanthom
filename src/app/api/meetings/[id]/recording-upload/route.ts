import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireOwnMeeting } from "@/server/meeting-guard";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireOwnMeeting(id);
  if ("error" in guard) return guard.error;

  const body = await req.json();
  const result = await handleUpload({
    request: req,
    body,
    onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
      const payload = clientPayload
        ? (JSON.parse(clientPayload) as { meetingId?: string })
        : {};
      if (payload.meetingId !== id || pathname !== `recordings/${id}.webm`) {
        throw new Error("Invalid recording upload target");
      }
      return {
        allowedContentTypes: ["video/webm*", "audio/webm*"],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: false,
        allowOverwrite: true,
        tokenPayload: JSON.stringify({ meetingId: id, multipart }),
      };
    },
  });
  return NextResponse.json(result);
}
