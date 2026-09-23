import { OnboardingWizard } from "@/components/onboarding-wizard";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <OnboardingWizard nextPath={next && next.startsWith("/") ? next : "/calls"} />
    </div>
  );
}
