"use client";

import { cn } from "@/lib/utils";

export function Waveform({
  bars = 48,
  className,
  barClassName,
  active = true,
  /** 0–1 playback position — bars before this point render solid (played), after render faded (upcoming), turning the decorative waveform into a real progress indicator across its full width. */
  progress,
}: {
  bars?: number;
  className?: string;
  barClassName?: string;
  active?: boolean;
  progress?: number;
}) {
  return (
    <div className={cn("flex h-10 w-full items-center justify-between", className)}>
      {Array.from({ length: bars }).map((_, i) => {
        const seed = (i * 37) % 100;
        const height = 25 + (seed % 75);
        const duration = 0.7 + (seed % 5) * 0.12;
        const delay = (seed % 10) * 0.06;
        const played = progress == null || i / bars <= progress;
        return (
          <span
            key={i}
            className={cn(
              "wave-bar w-[3px] shrink-0 rounded-full bg-accent transition-opacity",
              !active && "opacity-40",
              active && !played && "opacity-25",
              barClassName,
            )}
            style={{
              height: `${height}%`,
              animationDuration: active ? `${duration}s` : "0s",
              animationDelay: `${delay}s`,
              animationPlayState: active ? "running" : "paused",
            }}
          />
        );
      })}
    </div>
  );
}

/** Layered glossy sphere: iridescent base + bright highlight + dark rim. */
export function Orb({ size = 120, className, pulse = true }: { size?: number; className?: string; pulse?: boolean }) {
  return (
    <div
      className={cn("rounded-full", pulse && "animate-orb", className)}
      style={{
        width: size,
        height: size,
        background: `
          radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.35) 8%, transparent 22%),
          radial-gradient(circle at 68% 74%, hsl(262 85% 65% / 0.9) 0%, transparent 55%),
          radial-gradient(circle at 78% 30%, hsl(207 90% 70% / 0.85) 0%, transparent 50%),
          radial-gradient(circle at 26% 72%, hsl(340 88% 76% / 0.9) 0%, transparent 55%),
          radial-gradient(circle at 50% 50%, hsl(275 80% 80%) 0%, hsl(262 70% 62%) 60%, hsl(262 60% 46%) 100%)
        `,
        boxShadow: `
          0 20px 50px -12px hsl(262 76% 60% / 0.55),
          inset -10px -14px 26px hsl(262 60% 30% / 0.35),
          inset 8px 10px 20px rgba(255,255,255,0.5)
        `,
      }}
    />
  );
}
