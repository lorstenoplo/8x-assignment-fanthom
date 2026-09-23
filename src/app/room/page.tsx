import { requireOwnOnboardedWorkspace } from "@/server/nav-guard";
import { RoomClient } from "@/components/room/room-client";

export default async function RoomPage() {
  const workspace = await requireOwnOnboardedWorkspace();

  return (
    <RoomClient
      prefs={{
        autoRecord: workspace?.autoRecord ?? true,
        announceConsent: workspace?.announceConsent ?? true,
        guardExternal: workspace?.guardExternal ?? true,
        notetakerName: workspace?.notetakerName ?? "Aura",
        ownerName: workspace?.ownerName ?? "You",
      }}
    />
  );
}
