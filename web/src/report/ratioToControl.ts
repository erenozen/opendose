// The ratio to control (FEATURE-PLAN P-18): treated mean over control
// mean with Fieller's confidence interval, from the engine's
// ratio_to_control (unpaired t test) and each Dunnett comparison's ratio.
// Numbers go through formatSig, as every results number does. When the
// control mean is not clearly different from zero the interval is
// unbounded, and the words say so instead of printing numbers. Pure;
// unit-tested.
import { formatSig } from "../types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface RatioText {
  /** "0.65 (65% of Control)" */
  value: string;
  /** "0.65" and "65%", for tables with a column each */
  ratio: string;
  percent: string;
  /** "0.5762 to 0.7292", or the unbounded sentence */
  ci: string;
  unbounded: boolean;
}

export const FIELLER_SOURCE = "Fieller EC (1954) J R Stat Soc B 16:175";

export function ratioText(r: unknown, control: string): RatioText | null {
  const x = r as R | null;
  if (!x || typeof x.value !== "number" || !Number.isFinite(x.value)) return null;
  const ratio = formatSig(x.value);
  const percent = `${formatSig(100 * x.value)}%`;
  const value = `${ratio} (${percent} of ${control})`;
  if (x.unbounded || !Array.isArray(x.ci)) {
    return { value, ratio, percent, unbounded: true,
      ci: `unbounded: the mean of ${control} is not clearly different from zero` };
  }
  return { value, ratio, percent, unbounded: false, ci: `${formatSig(x.ci[0])} to ${formatSig(x.ci[1])}` };
}

/** The clause of "What this means" for an unpaired t test with a ratio
 *  to control: "Treated/Control = 0.65, 95% CI 0.5762 to 0.7292 by
 *  Fieller's method", or the unbounded reading. */
export function ratioClause(r: unknown, treated: string, control: string): string | null {
  const x = r as R | null;
  if (!x || typeof x.value !== "number" || !Number.isFinite(x.value)) return null;
  const head = `${treated}/${control} = ${formatSig(x.value)}`;
  if (x.unbounded || !Array.isArray(x.ci)) {
    return `${head}, a ratio whose 95% CI is unbounded because the mean of ${control} is not `
      + "clearly different from zero";
  }
  return `${head}, 95% CI ${formatSig(x.ci[0])} to ${formatSig(x.ci[1])} by Fieller's method`;
}
