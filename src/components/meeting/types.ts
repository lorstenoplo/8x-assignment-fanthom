import type {
  Meeting,
  Participant,
  TranscriptSegment,
  ActionItem,
  Highlight,
  SummaryContent,
} from "@/lib/db/schema";

export type MeetingDetailProps = {
  meeting: Meeting;
  participants: Participant[];
  segments: TranscriptSegment[];
  actionItems: ActionItem[];
  highlights: Highlight[];
  initialSummary: SummaryContent | null;
  summaryError: string | null;
};
