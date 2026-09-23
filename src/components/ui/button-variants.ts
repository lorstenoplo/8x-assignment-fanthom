import { cva } from "class-variance-authority";

/**
 * Kept in a plain (non "use client") module so Server Components can apply
 * the same classes to a plain <Link> without importing anything client-only.
 * The default variant is the reference's exact "New Meeting" button recipe.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-label-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "brand-gradient text-white shadow-[0_8px_20px_-4px_rgba(168,85,247,0.35)] hover:shadow-[0_10px_24px_-4px_rgba(168,85,247,0.45)] active:scale-[0.98]",
        obsidian: "bg-obsidian text-on-obsidian hover:brightness-125",
        /** A plain accent fill for actions that don't need the signature gradient's visual weight. */
        solid: "bg-primary text-on-primary shadow-sm hover:brightness-110 active:scale-[0.98]",
        secondary: "bg-muted text-foreground hover:bg-muted/70",
        outline: "border border-border bg-card/70 hover:bg-muted/60",
        ghost: "hover:bg-muted/60",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "rounded-none text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3.5 text-xs",
        lg: "h-12 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
