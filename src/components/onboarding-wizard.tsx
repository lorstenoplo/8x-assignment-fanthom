"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mic, ShieldCheck, Share2, Users, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { Logomark } from "@/components/logomark";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Prefs = {
  ownerName: string;
  autoRecord: boolean;
  shareWithAttendees: boolean;
  announceConsent: boolean;
  guardExternal: boolean;
  notetakerName: string;
};

const STEPS = ["Who's using it", "Recording", "Sharing", "Guardrails"] as const;

export function OnboardingWizard({ nextPath = "/calls" }: { nextPath?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({
    ownerName: "",
    autoRecord: true,
    shareWithAttendees: false,
    announceConsent: true,
    guardExternal: true,
    notetakerName: "Aura",
  });

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  const canAdvance = step !== 0 || prefs.ownerName.trim().length > 0;

  async function finish() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(nextPath);
      router.refresh();
    } catch {
      toast.error("Couldn't save your preferences — check the server is configured and try again.");
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-lg animate-fade-up">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2">
          <Logomark className="h-6 w-6 text-on-surface" />
          <span className="text-sm font-semibold">Aura</span>
        </div>
        <div className="flex gap-1.5 pt-2">
          {STEPS.map((_, i) => (
            <div key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-muted")} />
          ))}
        </div>
        <CardTitle className="pt-3 text-lg">{STEPS[step]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {step === 0 && (
          <div className="space-y-3">
            <CardDescription>What should we call you? This shows up as the host in your meetings.</CardDescription>
            <Input
              autoFocus
              placeholder="Your name"
              value={prefs.ownerName}
              onChange={(e) => set("ownerName", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canAdvance && setStep(1)}
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <CardDescription>How should the notetaker behave when a call starts?</CardDescription>
            <PrefRow
              icon={Mic}
              title="Auto-record every meeting"
              description="Arm the notetaker automatically when you start a test meeting, instead of asking each time."
              checked={prefs.autoRecord}
              onChange={(v) => set("autoRecord", v)}
            />
            <PrefRow
              icon={ShieldCheck}
              title="Announce recording out loud"
              description="Have the notetaker say it's recording when the call starts, and show a visible consent banner to everyone in the room. Recommended for GDPR / two-party-consent compliance."
              checked={prefs.announceConsent}
              onChange={(v) => set("announceConsent", v)}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <CardDescription>What happens to the recap after the call?</CardDescription>
            <PrefRow
              icon={Share2}
              title="Auto-share with every attendee"
              description="Send the AI summary and recording link to everyone on the call automatically. Off means it's only shared when you explicitly send it."
              checked={prefs.shareWithAttendees}
              onChange={(v) => set("shareWithAttendees", v)}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <CardDescription>
              The notetaker can answer questions mid-call when addressed by name, using recall from past meetings.
            </CardDescription>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Wake word / name</label>
              <Input value={prefs.notetakerName} onChange={(e) => set("notetakerName", e.target.value)} />
            </div>
            <PrefRow
              icon={Users}
              title="Guard answers when a guest is present"
              description="If anyone external joins the call, block the notetaker from repeating internal figures, other clients' names, or confidential context — it'll decline out loud instead."
              checked={prefs.guardExternal}
              onChange={(v) => set("guardExternal", v)}
            />
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button size="sm" disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" disabled={submitting} onClick={finish}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Finish setup
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PrefRow({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} label={title} />
    </div>
  );
}
