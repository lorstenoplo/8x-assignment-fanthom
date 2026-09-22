import { loadViewingWorkspace } from "@/server/nav-guard";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspace = await loadViewingWorkspace();
  return <AppShell workspace={{ id: workspace.id, ownerName: workspace.ownerName, isDemo: workspace.isDemo }}>{children}</AppShell>;
}
