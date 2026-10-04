// Colour-vision check for a graph's series colours: simulated protanopia,
// deuteranopia and tritanopia (Machado, Oliveira & Fernandes 2009, severity
// 1.0, applied in linear RGB), achromatopsia (luminance only) and a print
// grayscale, with pairwise colour differences (CIEDE2000, and CIE76 for
// reference) and the contrast of each colour against the background.
//
// Pure (no DOM). The built-in schemes in lib/palette.ts are validated
// offline and stay authoritative; this check is for what the user sees on
// a particular graph: custom colours, transparency, the scheme chosen.
import { contrastRatio, MARK_CONTRAST } from "./color.ts";

export type CvdMode = "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia"
  | "grayscale";

export const CVD_MODES: readonly CvdMode[] = [
  "protanopia", "deuteranopia", "tritanopia", "achromatopsia", "grayscale",
];

export const CVD_LABELS: Record<CvdMode, string> = {
  protanopia: "Protanopia (no red cones)",
  deuteranopia: "Deuteranopia (no green cones)",
  tritanopia: "Tritanopia (no blue cones)",
  achromatopsia: "Achromatopsia (no colour)",
  grayscale: "Grayscale print",
};

type M3 = readonly [readonly [number, number, number], readonly [number, number, number],
  readonly [number, number, number]];

/** Machado et al. (2009) simulation matrices at severity 1.0 (linear RGB). */
export const MACHADO: Record<"protanopia" | "deuteranopia" | "tritanopia", M3> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

export type RGB = [number, number, number];   // 0..255
export type Lab = [number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** sRGB channel (0..255) to linear light (0..1). */
export function toLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Linear light (0..1) to an sRGB channel (0..255). */
export function fromLinear(v: number): number {
  const x = clamp01(v);
  return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
}

/** Blend a colour over a background at opacity `alpha` (what the eye sees
 *  for a semi-transparent mark). */
export function blend(fg: RGB, bg: RGB, alpha: number): RGB {
  const a = clamp01(alpha);
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)) as RGB;
}

/** The colour as seen with the given colour-vision deficiency. */
export function simulate(rgb: RGB, mode: CvdMode): RGB {
  const lin = rgb.map(toLinear) as RGB;
  if (mode === "achromatopsia") {
    const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    const v = fromLinear(y);
    return [v, v, v];
  }
  if (mode === "grayscale") {
    // Rec. 601 luma on the encoded values: what office printers and
    // "convert to grayscale" in most tools do.
    const v = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    return [v, v, v];
  }
  const m = MACHADO[mode];
  const out = m.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  return out.map(fromLinear) as RGB;
}

export function simulateHex(hex: string, mode: CvdMode): string {
  const rgb = parseHex(hex);
  return rgb ? toHex(simulate(rgb, mode)) : hex;
}

/** CIE L*a*b* (D65) of an sRGB colour. */
export function toLab(rgb: RGB): Lab {
  const [r, g, b] = rgb.map(toLinear);
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const e = 216 / 24389, k = 24389 / 27;
  const f = (t: number) => (t > e ? Math.cbrt(t) : (k * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference: Euclidean distance in L*a*b*. */
export function deltaE76(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** CIEDE2000 colour difference (Sharma, Wu & Dalal 2005), kL = kC = kH = 1. */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (b: number, ap: number) => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h >= 0 ? h : h + 360;
  };
  const h1p = hp(b1, a1p), h2p = hp(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp))
    + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.20 * Math.cos(rad(4 * hbp - 63));
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
    + Rt * (dCp / Sc) * (dHp / Sh));
}

/** Below this CIEDE2000 difference two series colours look the same as
 *  small marks (flagged as a problem). */
export const CONFUSABLE_DE = 5;
/** Below this they are similar: distinguishable side by side, easily
 *  mistaken apart (noted). */
export const SIMILAR_DE = 10;

export interface CvdPair {
  a: number;
  b: number;
  dE: number;
  dE76: number;
  /** dE below CONFUSABLE_DE: indistinguishable, not just similar. */
  severe: boolean;
}

export interface CvdRow {
  mode: CvdMode | "normal";
  /** Colours as seen (after blending with the background at their opacity). */
  colors: string[];
  /** Pairs of series closer than SIMILAR_DE (severe below CONFUSABLE_DE). */
  confusable: CvdPair[];
  /** Series whose colour has less than 3:1 contrast with the background. */
  lowContrast: number[];
}

export interface SeriesColor {
  color: string;
  /** Fill opacity 0..1 (1 = opaque). */
  alpha?: number;
}

/** Simulated colours, confusable pairs and low-contrast series for normal
 *  vision and each deficiency. Colours that are not #rrggbb are skipped. */
export function cvdReport(series: SeriesColor[], background: string,
  modes: readonly CvdMode[] = CVD_MODES, threshold = SIMILAR_DE): CvdRow[] {
  const bg = parseHex(background) ?? [255, 255, 255];
  const seen = series.map((s) => {
    const rgb = parseHex(s.color);
    return rgb ? blend(rgb, bg, s.alpha ?? 1) : null;
  });
  const row = (mode: CvdMode | "normal"): CvdRow => {
    const sim = seen.map((c) => (c ? (mode === "normal" ? c : simulate(c, mode)) : null));
    const simBg = mode === "normal" ? bg : simulate(bg, mode);
    const labs = sim.map((c) => (c ? toLab(c) : null));
    const confusable: CvdPair[] = [];
    for (let a = 0; a < labs.length; a++) {
      for (let b = a + 1; b < labs.length; b++) {
        const la = labs[a], lb = labs[b];
        if (!la || !lb) continue;
        if (series[a].color.toLowerCase() === series[b].color.toLowerCase()
          && (series[a].alpha ?? 1) === (series[b].alpha ?? 1)) continue; // same on purpose
        const dE = deltaE2000(la, lb);
        if (dE < threshold) {
          confusable.push({ a, b, dE, dE76: deltaE76(la, lb), severe: dE < CONFUSABLE_DE });
        }
      }
    }
    const lowContrast = sim.flatMap((c, i) =>
      (c && contrastRatio(toHex(c), toHex(simBg)) < MARK_CONTRAST ? [i] : []));
    return { mode, colors: sim.map((c, i) => (c ? toHex(c) : series[i].color)),
      confusable, lowContrast };
  };
  return [row("normal"), ...modes.map(row)];
}
