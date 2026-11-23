/** The OpenDose mark: a dose-response sigmoid in a rounded tile (also
 *  public/favicon.svg, and the static shell in index.html). */
export function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7"
        fill="var(--accent-fill)" />
      <path d="M5 8.5 C 12 8.5 10.5 19.5 17.5 19.5 L 23 19.5"
        fill="none" stroke="var(--accent-ink)" strokeWidth="2.2"
        strokeLinecap="round" transform="rotate(180 14 14)" />
      <circle cx="14" cy="14" r="1.9" fill="var(--accent-ink)" />
    </svg>
  );
}
