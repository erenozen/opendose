// Contrast check for user-chosen graph colours. The scheme colours in
// lib/palette.ts are validated offline; a colour the user picks is not, so
// the dialogs warn when it falls below the 3:1 contrast graphical marks
// need against the plot surface (WCAG 2.x, non-text contrast).

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255)
    + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Minimum contrast for data marks against the plot background. */
export const MARK_CONTRAST = 3;

/** A warning sentence when `color` is too faint on `surface`, else "". */
export function contrastWarning(color: string | undefined, surface: string): string {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return "";
  const r = contrastRatio(color, surface);
  return r < MARK_CONTRAST
    ? `Low contrast on the plot background (${r.toFixed(1)}:1; marks need 3:1).`
    : "";
}
