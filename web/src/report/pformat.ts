// P values and significance summaries in one place. Every results table,
// results sentence and figure legend formats P through this module, with
// the project's P-value style (Preferences -> Reporting), so a project
// reports P one way everywhere.
//
// Styles and their sources:
// - GraphPad: exact P to four decimals, "P < 0.0001" below; asterisks
//   ns / * / ** / *** / **** at 0.05 / 0.01 / 0.001 / 0.0001 (GraphPad
//   Prism user guide, "P value format" and the asterisks FAQ). Results
//   tables keep the results precision (significant digits) above 0.0001,
//   as they always have: an exact value is never rounded away there.
// - APA 7: exact p to three decimals without a leading zero (a p value
//   cannot exceed 1), "p < .001" below (Publication Manual of the APA,
//   7th ed., sec. 6.36 and 6.44); asterisks stop at *** (p < .001).
// - NEJM: two decimals above 0.01, three between 0.001 and 0.01,
//   "P<0.001" below, no spaces (NEJM, statistical reporting guidelines
//   for authors); asterisks stop at ***.
// SAMPL (Lang & Altman 2013) asks for exact P as equalities with a floor
// of P < 0.001 and no bare "NS": all three styles give exact values.
import { formatSig } from "../types.ts";
import { DEFAULT_REPORT, type PStyle, type ReportPrefs } from "./prefs.ts";

export type { PStyle } from "./prefs.ts";

export interface PStyleInfo {
  label: string;
  /** The smallest P written exactly; below it "P < floor". */
  floor: number;
  /** Where the rule comes from. */
  source: string;
}

export const P_STYLES: Record<PStyle, PStyleInfo> = {
  graphpad: {
    label: "GraphPad", floor: 0.0001,
    source: "GraphPad Prism user guide: P value format (0.1234, < 0.0001) and asterisks FAQ",
  },
  apa: {
    label: "APA 7", floor: 0.001,
    source: "Publication Manual of the APA, 7th ed., sec. 6.36 and 6.44 (p = .032, p < .001)",
  },
  nejm: {
    label: "NEJM", floor: 0.001,
    source: "NEJM statistical reporting guidelines (P=0.03; three decimals below 0.01; P<0.001)",
  },
};

const isNum = (p: unknown): p is number => typeof p === "number" && Number.isFinite(p);

/** P without its "P =" prefix, e.g. "0.0321", ".032", "< 0.0001". */
export function pNumber(p: number, style: PStyle, mode: "text" | "table" = "text"): string {
  if (style === "apa") {
    if (p < 0.001) return "< .001";
    if (p > 0.999) return "> .999";
    return p.toFixed(3).replace(/^0/, "");
  }
  if (style === "nejm") {
    if (p < 0.001) return "<0.001";
    if (p > 0.99) return ">0.99";
    return p < 0.01 ? p.toFixed(3) : p.toFixed(2);
  }
  if (p < 0.0001) return "< 0.0001";
  if (mode === "table") return formatSig(p, 4);
  if (p > 0.9999) return "> 0.9999";
  return p.toFixed(4);
}

/** "P = 0.0321" / "p = .032" / "P=0.03", or the floor ("P < 0.0001"). */
export function formatPValue(p: unknown, style: PStyle = current.pStyle,
  label = "P"): string {
  if (!isNum(p)) return `${style === "apa" ? "p" : label} = n/a`;
  const n = pNumber(p, style, "text");
  const name = style === "apa" ? label.replace(/\bP\b/, "p") : label;
  if (style === "nejm") return n.startsWith("<") || n.startsWith(">") ? `${name}${n}` : `${name}=${n}`;
  return n.startsWith("<") || n.startsWith(">") ? `${name} ${n}` : `${name} = ${n}`;
}

/** Asterisk summary. GraphPad goes to **** (P ≤ 0.0001); APA and NEJM
 *  stop at *** (P ≤ 0.001). With hideNs, non-significant is "". */
export function pSummary(p: unknown, style: PStyle = current.pStyle,
  hideNs = current.hideNs): string {
  if (!isNum(p)) return "";
  if (p <= 0.0001 && style === "graphpad") return "****";
  if (p <= 0.001) return "***";
  if (p <= 0.01) return "**";
  if (p <= 0.05) return "*";
  return hideNs ? "" : "ns";
}

/** The star scale for a figure legend, e.g. "* P ≤ 0.05, ** P ≤ 0.01,
 *  *** P ≤ 0.001, **** P ≤ 0.0001; ns, P > 0.05". */
export function starScale(style: PStyle = current.pStyle, hideNs = current.hideNs): string {
  const p = style === "apa" ? "p" : "P";
  const num = (v: number) => (style === "apa" ? String(v).replace(/^0/, "") : String(v));
  const cuts = style === "graphpad" ? [0.05, 0.01, 0.001, 0.0001] : [0.05, 0.01, 0.001];
  const parts = cuts.map((c, i) => `${"*".repeat(i + 1)} ${p} ≤ ${num(c)}`);
  return parts.join(", ") + (hideNs ? "; pairs without a symbol: "
    : "; ns, not significant: ") + `${p} > ${num(0.05)}`;
}

// ---------------------------------------------------------- project state
// The open project's reporting preferences, set by the project provider on
// every render (as the results precision is), so plain formatting
// functions in results tables need no React context.
let current: ReportPrefs = { ...DEFAULT_REPORT };

export function setReportPrefs(r: ReportPrefs): void { current = r; }
export function currentReportPrefs(): ReportPrefs { return current; }

/** P in a results-table cell, in the project's style ("n/a" if missing). */
export function tableP(p: unknown): string {
  return isNum(p) ? pNumber(p, current.pStyle, "table") : "n/a";
}

/** Significance summary in a results-table cell, in the project's style. */
export function tableStars(p: unknown): string {
  return pSummary(p, current.pStyle, current.hideNs);
}
