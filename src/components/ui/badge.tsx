import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-5",
  {
    variants: {
      variant: {
        default: "bg-accent-soft text-accent",
        outline: "border border-border text-muted-foreground",
        muted: "bg-muted text-muted-foreground",
        warning: "bg-[color-mix(in srgb,var(--warning) 18%,transparent)] text-[var(--warning)]",
        destructive: "bg-[color-mix(in srgb,var(--destructive) 16%,transparent)] text-[var(--destructive)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
