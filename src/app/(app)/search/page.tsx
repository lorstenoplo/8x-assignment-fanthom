import { SearchClient } from "@/components/search-client";

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="text-xl font-semibold tracking-tight">Search</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Semantic search across every transcript — ask for a meaning, not just a keyword.
      </p>
      <SearchClient />
    </div>
  );
}
