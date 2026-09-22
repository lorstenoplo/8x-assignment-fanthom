import { AlertsClient } from "@/components/alerts-client";

export default function AlertsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="text-xl font-semibold tracking-tight">Alerts</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Get notified when a topic comes up in any meeting — pricing objections, churn risk, competitor mentions.
      </p>
      <AlertsClient />
    </div>
  );
}
