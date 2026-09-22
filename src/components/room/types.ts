export type RoomPrefs = {
  autoRecord: boolean;
  announceConsent: boolean;
  guardExternal: boolean;
  notetakerName: string;
  ownerName: string;
};

export type TranscriptLine = {
  id: string;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  final: boolean;
};

export type RoomParticipant = {
  id: string;
  name: string;
  email?: string;
  role: "host" | "guest" | "agent";
  isExternal: boolean;
};
