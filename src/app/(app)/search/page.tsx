import { SearchClient } from "@/components/search-client";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <SearchClient initialQuery={q ?? ""} />;
}
