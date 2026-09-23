/** The three-dot logomark from the design reference, used everywhere the brand mark appears. */
export function Logomark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="7.5" cy="7.5" r="4.5" opacity="0.9" />
      <circle cx="16.5" cy="7.5" r="4.5" opacity="0.6" />
      <circle cx="12" cy="16.5" r="4.5" opacity="0.75" />
    </svg>
  );
}
