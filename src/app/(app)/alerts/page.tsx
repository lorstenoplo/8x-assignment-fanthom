import { AlertsClient } from "@/components/alerts-client";

export default function AlertsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-4 py-1 text-label-sm text-on-surface-variant shadow-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Watching every meeting
        </span>
        <h1 className="text-headline-lg text-on-surface">Alerts</h1>
        <p className="max-w-md text-body-md text-on-surface-variant">
          Get notified when a topic comes up in any meeting — pricing objections, churn risk, competitor mentions.
        </p>
      </div>
      <AlertsClient />
    </div>
  );
}
