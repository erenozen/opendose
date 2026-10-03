// Chain-link glyph for derived (linked) tables, drawn with currentColor.
export function LinkIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor"
      strokeWidth="1.3" strokeLinecap="round" aria-hidden="true" className="link-icon">
      <path d="M5 7a2.2 2.2 0 0 0 3.1 0l1.6-1.6a2.2 2.2 0 0 0-3.1-3.1l-.6.6" />
      <path d="M7 5a2.2 2.2 0 0 0-3.1 0L2.3 6.6a2.2 2.2 0 0 0 3.1 3.1l.6-.6" />
    </svg>
  );
}

/** Dice glyph for simulated tables. */
export function DiceIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor"
      strokeWidth="1.2" aria-hidden="true" className="link-icon">
      <rect x="1.5" y="1.5" width="9" height="9" rx="2" />
      <circle cx="4.2" cy="4.2" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="7.8" cy="7.8" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="6" cy="6" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}
