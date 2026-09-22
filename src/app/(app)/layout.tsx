import { requireOnboardedWorkspace } from "@/server/nav-guard";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspace = await requireOnboardedWorkspace();
  return <AppShell workspace={{ id: workspace.id, ownerName: workspace.ownerName, isDemo: workspace.isDemo }}>{children}</AppShell>;
}
