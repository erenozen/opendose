// qPCR reference-gene check, shown before any fold change: each candidate
// reference gene's Cq per group with the test across groups, geNorm M and
// the SD of ΔCq between references, from the engine's
// `qpcr_reference_check` / the `reference_stability` block of `qpcr`
// (engine/opendose/qpcr_refs.py). Rules (the engine's defaults, stated in
// the UI with their sources):
// - a reference "shifts with treatment" when its Cq differs across groups
//   (one-way ANOVA, P < 0.05) by more than 1 cycle (a 2-fold change at
//   100% efficiency): normalising to it biases every fold change (MIQE
//   2.0, Bustin et al. 2025, Clin Chem 71:634);
// - geNorm M > 1.5 marks a gene as not stable (Vandesompele et al. 2002,
//   Genome Biol 3:research0034).
// Pure: chips, one-click choices and the methods sentence, unit-tested.
import { formatPValue } from "../../../report/pformat.ts";
import { formatSig } from "../../../types.ts";
import type { QData, QpcrOptions } from "./model.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export const REF_SOURCES = {
  genorm: { label: "Vandesompele et al. 2002, Genome Biol 3:research0034 (geNorm)",
    url: "https://doi.org/10.1186/gb-2002-3-7-research0034" },
  miqe: { label: "MIQE 2.0: Bustin et al. 2025, Clin Chem 71:634",
    url: "https://doi.org/10.1093/clinchem/hvaf043" },
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Reference genes the check covers: the ones set aside with a one-click
 *  choice (options.referenceCandidates) and the ones in use. */
export function referenceCandidates(chosen: string[], saved: string[] | undefined, targets: string[]): string[] {
  const out: string[] = [];
  for (const g of [...(saved ?? []), ...chosen]) {
    if (targets.includes(g) && !out.includes(g)) out.push(g);
  }
  return out;
}

/** Engine payload of the stand-alone check (same QC limits as the run). */
export function referenceCheckPayload(d: QData, o: QpcrOptions, genes: string[], calibrator: string,
  efficiencies?: Record<string, number>, groups?: string[]): R {
  const options: R = {
    reference_genes: genes, calibrator, max_cq: o.maxCq, max_spread: o.maxSpread,
    exclude_high_cq: o.excludeHighCq,
  };
  if (groups?.length) options.groups = groups;
  if (efficiencies && Object.keys(efficiencies).length) options.efficiencies = efficiencies;
  const und = Number(o.undetermined);
  if (o.undetermined.trim() !== "" && Number.isFinite(und)) options.undetermined_value = und;
  return {
    analysis: "qpcr_reference_check",
    data: { records: d.records.filter((r) => genes.includes(r.target)).map((r) => ({
      sample: r.sample, group: r.group || null, target: r.target, cq: r.cq,
      ...(r.well ? { well: r.well } : {}),
    })) },
    options,
  };
}

export interface RefChip { gene: string; tone: "pass" | "fail" | "warn" | "info"; text: string }

const cyc = (v: number) => formatSig(Math.abs(v), 2);

/** One chip per gene: shifts with treatment, not stable, or stable. */
export function referenceChips(stab: R | null | undefined): RefChip[] {
  if (!stab || stab.error || !Array.isArray(stab.genes)) return [];
  const mMax = isNum(stab.thresholds?.m) ? stab.thresholds.m : 1.5;
  return stab.genes.map((g: R): RefChip => {
    const p = g.group_test?.p;
    const ps = isNum(p) ? formatPValue(p) : "P not computed";
    if (g.shifts_with_treatment) {
      return { gene: g.gene, tone: "fail",
        text: `${g.gene} shifts with treatment by ${cyc(g.shift)} Cq (${ps}): do not normalise to it` };
    }
    if (g.unstable) {
      return { gene: g.gene, tone: "fail",
        text: `${g.gene} not stable (M = ${formatSig(g.M, 2)} > ${mMax})` };
    }
    const flags: string[] = g.flags ?? [];
    if (flags.includes("large_shift_not_significant")) {
      return { gene: g.gene, tone: "warn",
        text: `${g.gene} differs by ${cyc(g.shift)} Cq between groups (${ps}, not significant): check with more samples` };
    }
    if (flags.includes("small_significant_shift")) {
      return { gene: g.gene, tone: "warn",
        text: `${g.gene} differs slightly between groups (${cyc(g.shift)} Cq, ${ps})` };
    }
    if (isNum(g.M)) return { gene: g.gene, tone: "pass", text: `${g.gene} stable (M = ${formatSig(g.M, 2)})` };
    if (flags.includes("not_tested")) {
      return { gene: g.gene, tone: "info", text: `${g.gene}: not tested across groups (too few samples per group)` };
    }
    return { gene: g.gene, tone: "pass", text: `${g.gene} does not shift with treatment (${ps})` };
  });
}

/** Genes fit to normalise to: no shift with treatment and not unstable. */
export function usableReferences(stab: R | null | undefined): string[] {
  if (!stab || stab.error || !Array.isArray(stab.genes)) return [];
  return stab.genes.filter((g: R) => !g.shifts_with_treatment && !g.unstable).map((g: R) => String(g.gene));
}

export interface RefAction { label: string; genes: string[] }

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** One-click choices: each usable gene alone ("Use GAPDH only"), every
 *  candidate together ("Use both (geometric mean)"), and the usable ones
 *  together when that is a different set; the current choice is left out. */
export function referenceActions(stab: R | null | undefined, current: string[]): RefAction[] {
  if (!stab || stab.error || !Array.isArray(stab.genes)) return [];
  const all: string[] = stab.genes.map((g: R) => String(g.gene));
  const ok = usableReferences(stab);
  const out: RefAction[] = [];
  const add = (label: string, genes: string[]) => {
    if (genes.length && !same(genes, current) && !out.some((x) => same(x.genes, genes))) out.push({ label, genes });
  };
  if (ok.length >= 2 && ok.length < all.length) add(`Use ${list(ok)} (geometric mean)`, ok);
  for (const g of ok) add(`Use ${g} only`, [g]);
  if (all.length >= 2) add(`Use ${all.length === 2 ? "both" : `all ${all.length}`} (geometric mean)`, all);
  return out;
}

function list(a: string[]): string {
  return a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
}

/** The references in use that shift with treatment or are not stable. */
export function badInUse(stab: R | null | undefined, used: string[]): string[] {
  if (!stab || stab.error || !Array.isArray(stab.genes)) return [];
  return stab.genes.filter((g: R) => used.includes(g.gene) && (g.shifts_with_treatment || g.unstable))
    .map((g: R) => String(g.gene));
}

/** Methods sentence: which references were used and why. */
export function referenceMethods(stab: R | null | undefined, used: string[]): string {
  if (!stab || stab.error || !Array.isArray(stab.genes) || !stab.genes.length) return "";
  const t = stab.thresholds ?? {};
  const per = stab.genes.map((g: R) => {
    const p = g.group_test?.p;
    const bits = [isNum(g.M) ? `M = ${formatSig(g.M, 2)}` : null,
      isNum(g.shift) ? `${formatSig(g.shift, 2)} cycles between groups${isNum(p) ? `, ${formatPValue(p)}` : ""}` : null]
      .filter(Boolean).join("; ");
    const verdict = g.shifts_with_treatment ? "shifted with treatment"
      : g.unstable ? "was not stable" : "was stable";
    const role = used.includes(g.gene) ? "used" : "not used";
    return `${g.gene} ${verdict} (${bits}) and was ${role}`;
  });
  return `Reference genes were checked before normalisation: geNorm M over all samples `
    + `(Vandesompele et al. 2002; M > ${t.m ?? 1.5} = not stable) and each gene's Cq compared across `
    + `groups by one-way ANOVA (a shift with treatment = P < ${t.alpha ?? 0.05} and more than `
    + `${t.shift_cq ?? 1} cycle between group means; MIQE 2.0, Bustin et al. 2025): ${per.join("; ")}.`;
}
