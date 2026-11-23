// Compare two event rates (FEATURE-PLAN P-47): the form, its engine
// payload (engine rate_compare: rates.compare_rates, as R's poisson.test)
// and the rows the dialog shows. Pure; unit-tested (__tests__/rates.test.ts).
import { formatSig } from "../types.ts";
import { pLabel } from "../report/pformat.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RateForm {
  name1: string; events1: string; exposure1: string;
  name2: string; events2: string; exposure2: string;
  /** What the exposure is measured in ("hours", "mm²", "10⁶ cells"). */
  unit: string;
}

export const DEFAULT_RATE_FORM: RateForm = {
  name1: "Group 1", events1: "", exposure1: "",
  name2: "Group 2", events2: "", exposure2: "",
  unit: "",
};

export const RATE_SOURCES = [
  { label: "Przyborowski & Wilenski 1940, Biometrika 31:313", url: "https://doi.org/10.1093/biomet/31.3-4.313" },
  { label: "Garwood 1936, Biometrika 28:437", url: "https://doi.org/10.1093/biomet/28.3-4.437" },
];

const parse = (s: string) => {
  const t = s.trim().replace(",", ".");
  return t === "" ? null : Number(t);
};

/** The problem with one field, or null. */
export function eventsProblem(s: string): string | null {
  const v = parse(s);
  if (v === null) return null;
  return Number.isInteger(v) && v >= 0 ? null : "Enter a whole number of events, 0 or more";
}

export function exposureProblem(s: string): string | null {
  const v = parse(s);
  if (v === null) return null;
  return Number.isFinite(v) && v > 0 ? null : "Enter an exposure above 0";
}

/** The engine payload, or null while a field is empty or invalid. */
export function ratePayload(f: RateForm): Record<string, unknown> | null {
  const vals = [f.events1, f.exposure1, f.events2, f.exposure2];
  if (vals.some((v) => parse(v) === null)) return null;
  if (eventsProblem(f.events1) || eventsProblem(f.events2)
    || exposureProblem(f.exposure1) || exposureProblem(f.exposure2)) return null;
  return {
    analysis: "rate_compare",
    data: { groups: [
      { name: f.name1.trim() || "Group 1", events: parse(f.events1), exposure: parse(f.exposure1) },
      { name: f.name2.trim() || "Group 2", events: parse(f.events2), exposure: parse(f.exposure2) },
    ] },
    options: {},
  };
}

const ci = (c: unknown): string => {
  if (!Array.isArray(c)) return "n/a";
  const f = (v: unknown) => (typeof v === "number" ? formatSig(v) : "∞");
  return `${f(c[0])} to ${f(c[1])}`;
};

export interface RateRow { label: string; value: string }

/** "per hour" from "hours"; "per unit" when no unit was given. */
export function perUnit(unit: string): string {
  const u = unit.trim();
  if (!u) return "per unit of exposure";
  return `per ${u.replace(/^(hours|days|minutes|seconds|weeks|years|animals|wells|fields|slides)$/,
    (w) => w.slice(0, -1))}`;
}

/** The result as rows: each rate with its exact CI, the ratio, the P values. */
export function rateRows(r: any, unit: string): RateRow[] {
  if (!r || r.error || !Array.isArray(r.groups)) return [];
  const [a, b] = (r.names ?? ["Group 1", "Group 2"]) as string[];
  const per = perUnit(unit);
  const rows: RateRow[] = r.groups.map((g: any, i: number) => ({
    label: `Rate of ${i === 0 ? a : b} (${per}, exact 95% CI)`,
    value: `${formatSig(g.rate)} (${ci(g.ci)}); ${g.events} events in ${formatSig(g.exposure)}`,
  }));
  if (r.p_two_tailed == null) {
    rows.push({ label: "Rate ratio and test", value: String(r.test ?? "not computed") });
    return rows;
  }
  rows.push({
    label: `Rate ratio ${a}/${b} (exact conditional 95% CI)`,
    value: r.rate_ratio == null
      ? `unbounded: no events in ${b} (CI ${ci(r.ratio_ci)})`
      : `${formatSig(r.rate_ratio)} (${ci(r.ratio_ci)})`,
  });
  rows.push({ label: "P value, exact conditional test (two-tailed)", value: pLabel(r.p_two_tailed) });
  rows.push({ label: `One-tailed P, ${a} rate higher`, value: pLabel(r.p_greater) });
  rows.push({ label: `One-tailed P, ${a} rate lower`, value: pLabel(r.p_less) });
  return rows;
}

/** One sentence that reads the result. */
export function rateSentence(r: any): string {
  if (!r || r.error || !Array.isArray(r.groups) || r.p_two_tailed == null) return "";
  const [a, b] = (r.names ?? ["Group 1", "Group 2"]) as string[];
  const ratio = r.rate_ratio == null ? `cannot be bounded above (no events in ${b})`
    : `is ${formatSig(r.rate_ratio)} (95% CI ${ci(r.ratio_ci)})`;
  return `The rate in ${a} divided by the rate in ${b} ${ratio}; the exact conditional test gives `
    + `${pLabel(r.p_two_tailed)} (two-tailed). The test conditions on the ${r.n_events} events in all `
    + "and assumes events occur independently at a constant rate within each group (Poisson).";
}
