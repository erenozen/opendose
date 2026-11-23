// Lin's concordance correlation coefficient (P-43) as the method-comparison
// results print it: the value with its CI, and the caveat beside it that
// the CCC mixes precision and accuracy (Lin 1989: rho_c = r x C_b). The
// engine computes it (methodcomp.lin_ccc) for Bland-Altman, Deming and
// Passing-Bablok results. Pure; unit-tested.
import { formatSig } from "../../types.ts";

export interface CccResult {
  error?: string;
  n: number;
  ccc: number;
  ci: [number, number] | null;
  ci_level: number;
  ci_note?: string;
  pearson_r: number;
  bias_correction: number | null;
}

export const CCC_LABEL = "Lin's concordance correlation (CCC)";

const pct = (level: number) => `${Number((level * 100).toPrecision(4))}%`;

/** "0.9431 (95% CI 0.9012 to 0.9681)", or why it is missing. */
export function cccText(c: CccResult | undefined | null): string | null {
  if (!c) return null;
  if (c.error) return `not computed: ${c.error}`;
  const ci = c.ci ? ` (${pct(c.ci_level)} CI ${formatSig(c.ci[0])} to ${formatSig(c.ci[1])})`
    : c.ci_note ? ` (no CI: ${c.ci_note})` : "";
  return `${formatSig(c.ccc)}${ci}`;
}

/** The caveat read with the number: the CCC is precision times accuracy. */
export function cccCaveat(c: CccResult | undefined | null): string | null {
  if (!c || c.error) return null;
  const parts = c.bias_correction == null ? ""
    : `: Pearson's r ${formatSig(c.pearson_r)} (precision) × ${formatSig(c.bias_correction)} (accuracy, `
      + "closeness to the line of identity)";
  return `The CCC mixes precision and accuracy${parts}, so a high value does not by itself show that `
    + "the methods agree closely enough for use; read it with the bias and limits of agreement (Lin 1989).";
}
