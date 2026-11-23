// The Checks row chip of a Poisson regression (P-46): counts that vary
// more than a Poisson distribution allows (dispersion ratio φ = Pearson
// χ² / df) offer quasi-Poisson standard errors in one click; with
// quasi-Poisson on, the chip says so and offers the switch back. Pure.
import type { Chip } from "../../guide/checks.ts";
import { SRC } from "../../guide/sources.ts";
import { formatSig } from "../../types.ts";

interface PoissonLike {
  error?: string;
  family?: string;
  dispersion?: { phi: number; df: number };
}

/** The engine's overdispersion rule (multivar.poisson_regression): φ above
 *  1.5 with at least 5 residual df. */
export function overdispersed(r: PoissonLike | null | undefined): boolean {
  const d = r?.dispersion;
  return !!d && d.phi > 1.5 && d.df >= 5;
}

/** φ as the chip and the results show it (4 significant digits). */
export const phiText = (phi: number) => formatSig(phi, 4);

/** The chip for a Poisson regression result on results sheet
 *  `resultsId`, or null when there is nothing to say. */
export function dispersionChip(analysisId: string, result: unknown, resultsId: string): Chip | null {
  if (analysisId !== "mv_poisson") return null;
  const r = result as PoissonLike | null;
  if (!r || r.error || !r.dispersion || !Number.isFinite(r.dispersion.phi)) return null;
  const phi = r.dispersion.phi;
  const factor = formatSig(Math.sqrt(phi), 4);
  const sources = [SRC.wedderburn1974];
  if (r.family === "quasipoisson") {
    return { id: "dispersion", label: `Quasi-Poisson SEs (φ = ${phiText(phi)})`, state: "ok",
      action: "quasi-poisson", target: resultsId, sources,
      detail: `Every standard error is the Poisson one multiplied by √φ = ${factor}, the P values come from t `
        + `with ${r.dispersion.df} df and the intervals are Wald intervals from t. The estimates and rate ratios `
        + "are the Poisson ones."
        + (phi < 1 ? " φ is below 1, so these SEs are smaller than the Poisson ones: counts that vary less than "
          + "a Poisson distribution are unusual, so check how they were counted." : "") };
  }
  if (!overdispersed(r)) return null;
  return { id: "dispersion", label: `Counts are overdispersed (φ = ${phiText(phi)})`, state: "warn",
    action: "quasi-poisson", target: resultsId, sources,
    detail: `The counts vary ${phiText(phi)} times as much as a Poisson distribution allows (Pearson χ² / df), `
      + "so the Poisson standard errors, confidence intervals and P values are too small. Quasi-Poisson keeps "
      + `the estimates and multiplies every standard error by √φ = ${factor}.` };
}
