// Custom contrasts after a one-way or an ordinary two-way ANOVA (P-83):
// coefficients typed over the group (or cell) means, each labelled planned
// (its own t test) or post hoc (Scheffé's adjustment for every contrast
// among the means). The engine computes every number
// (engine/opendose/twoway_contrasts.py custom_contrasts); this module
// holds the stored form, the checks of a typed contrast and the payload.
// Pure: unit-tested in __tests__/customContrasts.test.ts.
import { formatSig } from "../../types.ts";

export interface CustomContrast {
  name: string;
  coefficients: number[];
  /** Chosen before seeing the data: not adjusted. Otherwise Scheffé. */
  planned: boolean;
}

/** The stored list, kept only when well formed (results options from
 *  older files have none). */
export function normalizeContrasts(raw: unknown): CustomContrast[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c): CustomContrast[] => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    const coef = Array.isArray(o.coefficients) ? o.coefficients : [];
    if (!coef.length || !coef.every((v) => typeof v === "number" && Number.isFinite(v))) return [];
    return [{ name: typeof o.name === "string" ? o.name : "", coefficients: coef as number[],
      planned: o.planned === true }];
  });
}

/** The engine option, or nothing when no contrast is set. */
export function contrastsOption(list: CustomContrast[] | undefined): Record<string, unknown> {
  const l = normalizeContrasts(list);
  return l.length ? { custom_contrasts: l } : {};
}

/** What is wrong with typed coefficients, or null (they make a contrast). */
export function coefficientProblem(coef: (number | null)[]): string | null {
  if (coef.some((c) => c === null)) return "Enter a coefficient for every mean (0 to leave one out)";
  const c = coef as number[];
  if (c.filter((v) => v !== 0).length < 2) return "Enter at least two coefficients that are not 0";
  const sum = c.reduce((a, b) => a + b, 0);
  if (Math.abs(sum) > 1e-9 * Math.max(...c.map(Math.abs))) {
    return `Make the coefficients add up to 0 (they add up to ${formatSig(sum, 4)})`;
  }
  return null;
}

const coefText = (v: number) => (Number.isInteger(v) ? String(Math.abs(v)) : formatSig(Math.abs(v), 4));

/** "−2 × Vehicle + Drug A + Drug B". */
export function contrastText(coef: number[], names: string[]): string {
  const parts = coef.map((c, i) => [c, names[i] ?? `Mean ${i + 1}`] as const).filter(([c]) => c !== 0);
  return parts.map(([c, nm], i) => {
    const mag = Math.abs(c) === 1 ? nm : `${coefText(c)} × ${nm}`;
    if (i === 0) return c < 0 ? `−${mag}` : mag;
    return `${c < 0 ? "−" : "+"} ${mag}`;
  }).join(" ") || "0";
}

/** The name a new contrast gets when none is typed. */
export function defaultName(list: CustomContrast[]): string {
  return `Contrast ${list.length + 1}`;
}
