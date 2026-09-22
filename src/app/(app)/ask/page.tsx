import { AskClient } from "@/components/ask-client";

export default function AskPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 py-8 md:px-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ask</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ask anything across every meeting you've had.</p>
      </div>
      <AskClient />
    </div>
  );
}
