import { cn, initials, speakerHue } from "@/lib/utils";

export function Avatar({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const hue = speakerHue(name);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-extrabold uppercase ring-2 ring-white/80", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.36),
        background: `hsl(${hue} 85% 82%)`,
        color: `hsl(${hue} 55% 32%)`,
      }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
