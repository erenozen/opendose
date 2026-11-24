// "What this means" (P-69) for the assay modules, beside
// report/meaning.ts (whose dispatcher calls assayMeaning first). The same rules hold: every number
// is read from the module's or the engine's own result fields and written
// as the results sheet writes it (formatSig); nothing is recomputed; P
// above 0.05 is never "no difference" (Amrhein et al. 2019); each reader
// says what the headline number means, how it is most often misread, and
// cites its sources from guide/sources.ts. Pure (no React); pinned in
// __tests__/meaningAssays.test.ts.
import { formatSig } from "../types.ts";
import { formatPValue, type PStyle } from "./pformat.ts";
import type { Meaning, MeaningTable } from "./meaning.ts";
import { SRC, type Source } from "../guide/sources.ts";
import { scoreReading } from "../sheets/assays/synergyModel.ts";
import { LINKAGE_LABEL, METRIC_LABEL } from "../sheets/assays/clusterModel.ts";
import { FDR_LABEL } from "../sheets/assays/volcanoModel.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ci2 = (v: unknown): [number, number] | null =>
  (Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) ? [v[0], v[1]] : null);
const ALPHA = 0.05;
/** A number as the results sheet shows it, with a real minus sign. */
const fmt = (v: number): string => formatSig(v).replace(/^-/, "−");
const P = (p: number, style: PStyle) => formatPValue(p, style);
const level = (l: unknown) => `${Number(((num(l) ? l : 0.95) * 100).toPrecision(4))}%`;
const ciText = (c: [number, number] | null, l: unknown = 0.95, what = "CI") =>
  (c ? `${level(l)} ${what} ${fmt(c[0])} to ${fmt(c[1])}` : "");
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** "Logistic growth" -> "logistic growth"; "LOWESS (…)" stays. */
const lower = (s: string) => (/^[A-Z][A-Z]/.test(s) ? s : s.replace(/^./, (x) => x.toLowerCase()));
const unitOf = (u: unknown) => (typeof u === "string" && u.trim() ? ` ${u.trim()}` : "");
/** "h" from "Time (h)" (the X title's unit), else the X unit, else "". */
const xUnit = (t: MeaningTable | null | undefined) => /\(([^()]{1,16})\)\s*$/.exec(t?.xTitle ?? "")?.[1]
  ?? (t?.xUnit?.trim() || "");

function mk(sentence: string, sources: Source[], misreading?: string, test?: string): Meaning {
  const seen = new Set<string>();
  return { sentence, sources: sources.filter((s) => !seen.has(s.url) && seen.add(s.url)),
    ...(misreading ? { misreading } : {}), ...(test ? { test } : {}) };
}

/** "a ratio this far from 1 would be unusual (P = 0.0008) if …" or "the
 *  data do not show …" for a P beside an estimate. */
function pWords(p: unknown, style: PStyle, ifNot: string, notShown: string): string {
  if (!num(p)) return "";
  return p < ALPHA ? `; a difference this large would be unusual (${P(p, style)}) if ${ifNot}`
    : `; the data do not show ${notShown} (${P(p, style)})`;
}
const sigSources = (p: unknown) => [num(p) && p < ALPHA ? SRC.greenland2016 : SRC.amrhein2019];

// ------------------------------------------------------------- assays

/** Standard curve: accepted by its back-calculated standards (ICH M10),
 *  and the range where concentrations can be reported. */
function stdcurveMeaning(r: R): Meaning | null {
  const plates: R[] = Array.isArray(r.plates) ? r.plates : [];
  const res = plates.find((p) => p?.res && !p.res.error)?.res;
  const acc = res?.acceptance;
  if (!acc || typeof acc.accepted !== "boolean") return null;
  const unit = unitOf(r.unit);
  const more = plates.length > 1 ? " (first plate shown)" : "";
  const counts = num(acc.n_pass) && num(acc.n_standards)
    ? `: ${acc.n_pass} of ${acc.n_standards} standards back-calculate within the limits${num(acc.n_levels_pass)
      && num(acc.n_levels) ? ` (${acc.n_levels_pass} of ${acc.n_levels} levels)` : ""}` : "";
  const qr = res.quantification_range;
  const range = qr && num(qr.lloq) && num(qr.uloq)
    ? `, so concentrations from ${fmt(qr.lloq)} to ${fmt(qr.uloq)}${unit} (LLOQ to ULOQ) can be reported` : "";
  const unknowns: R[] = Array.isArray(res.unknowns) ? res.unknowns : [];
  const out = unknowns.filter((u) => u?.status === "<LLOQ" || u?.status === ">ULOQ").length;
  const outT = unknowns.length && out ? ` ${out} of ${unknowns.length} unknowns fall outside that range and are not quantified.` : "";
  const sentence = acc.accepted
    ? `The standard curve${more} meets the ICH M10 acceptance criteria${counts}${range}.${outT}`
    : `The standard curve${more} does not meet the ICH M10 acceptance criteria${counts}${Array.isArray(acc.reasons)
      && acc.reasons.length ? ` (${acc.reasons.map(String).join("; ").replace(/\.$/, "")})` : ""}, so its concentrations should not be reported.`;
  return mk(sentence, [SRC.ichM10, SRC.gpInterpolate],
    "a high R² as an accurate curve. ICH M10 judges a standard curve by how close each standard back-calculates to its nominal concentration, not by R²; and a concentration read beyond the lowest or highest accepted standard is an extrapolation, not a measurement.",
    `Standard curve (${String(res.fit?.label ?? res.model ?? "fitted model")}): unknowns are read off the curve at their measured signal.`);
}

/** Plate QC: the Z′ factor of the controls (Zhang et al. 1999). */
function plateMeaning(r: R): Meaning | null {
  const plates: R[] = Array.isArray(r.plates) ? r.plates : [];
  const p = plates.find((x) => num(x?.qc?.z_prime));
  if (!p) return null;
  const z = p.qc.z_prime;
  const more = plates.length > 1 ? " (first plate with controls shown)" : "";
  const cat = typeof p.qc.category === "string" ? ` (${p.qc.category})` : "";
  const reading = z >= 0.5 ? "the positive and negative controls are separated by much more than their scatter, so the plate can tell an active well from an inactive one"
    : z > 0 ? "the controls overlap enough that single wells near the middle of the window are hard to call"
      : "the scatter of the controls is as wide as the gap between them, so the plate cannot separate active from inactive wells";
  const flags = Array.isArray(p.qc_flags) && p.qc_flags.length ? ` QC flags: ${p.qc_flags.map(String).join("; ")}.` : "";
  return mk(`Z′ = ${fmt(z)}${cat}${more}: ${reading} (Z′ ≥ 0.5 is an excellent assay).${flags}`,
    [SRC.zhang1999],
    "Z′ as a check on each compound. Z′ is computed from the control wells only: it says how well the plate separates the controls, not whether any compound's curve or value is right.",
    "Plate QC: Z′ = 1 − 3 (SD of the positive + SD of the negative controls) / |difference of their means|.");
}

/** Flow summary: one value per experiment (donor) and condition. */
function flowMeaning(r: R): Meaning | null {
  const exps: string[] = Array.isArray(r.experiments) ? r.experiments.map(String) : [];
  const conds: string[] = Array.isArray(r.conditions) ? r.conditions.map(String) : [];
  if (!exps.length || !conds.length) return null;
  const unit = typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : "experiments";
  const stat = String(r.stat_label ?? r.statistic ?? "The statistic");
  return mk(`${stat} is one value per ${unit === "experiments" ? "experiment" : unit.replace(/s$/, "")} and condition: `
    + `${exps.length} ${unit} in ${conds.length} conditions, so n is ${exps.length} ${unit}, however many cells were acquired.`,
  [SRC.lord2020, SRC.lazic2010],
  "the cells (events) acquired as replicates. Thousands of cells make each percentage precise, but the donors or experiments are the independent units a test compares.",
  "Flow cytometry summary: the gated statistic of each sample, arranged as experiments × conditions for a matched comparison.");
}

/** Densitometry and luciferase: the ratio of normalised signals against
 *  the control with its CI, from the module's own statistics block. */
function ratioMeaning(r: R, what: string, unitWord: string, sources: Source[], style: PStyle,
  misreading: string): Meaning | null {
  const st = r.statistics;
  if (!st) return null;
  const control = String(r.control_group ?? "the control");
  const n = num(r.n_units) ? r.n_units : num(r.n_blots_used) ? r.n_blots_used : num(st.n_pairs) ? st.n_pairs : null;
  const nT = n !== null ? `${n} ${unitWord}${n === 1 ? "" : "s"}` : "";
  const cmp: R[] = Array.isArray(st.comparisons) ? st.comparisons.filter((c: R) => num(c?.ratio)) : [];
  let group: string, ratio: number, ci: [number, number] | null, p: unknown, more = "";
  if (cmp.length) {
    const c = cmp[0];
    group = String(c.first ?? "the group");
    ratio = c.ratio; ci = ci2(c.ratio_ci); p = c.p_adjusted;
    more = cmp.length > 1 ? "first comparison with the control shown, P adjusted for the comparisons" : "";
  } else {
    const r1 = num(st.geometric_mean_ratio) ? st.geometric_mean_ratio : st.ratio;
    if (!num(r1)) return null;
    group = Array.isArray(st.names) ? String(st.names[0]) : "the treated group";
    ratio = r1; ci = ci2(st.ci_ratio); p = st.p_two_tailed ?? st.p;
  }
  const level0 = st.effect_size?.ci_level ?? 0.95;
  const paren = [ci ? ciText(ci, level0) : "", nT, more].filter(Boolean).join("; ");
  return mk(`${what} in ${group} was ${fmt(ratio)} times that in ${control}${paren ? ` (${paren})` : ""}`
    + `${num(p) ? (p < ALPHA ? `; a ratio this far from 1 would be unusual (${P(p, style)}) if the treatment did not change it`
      : `; the data do not show a change (${P(p, style)})${ci && ci[0] < 1 && ci[1] > 1 ? ", and the CI includes 1" : ""}`) : ""}.`,
  [...sources, ...sigSources(p)], misreading,
  typeof st.note === "string" ? st.note : undefined);
}

/** Growth curves: the doubling time of the first fitted curve. */
function growthMeaning(r: R, t: MeaningTable | null | undefined): Meaning | null {
  const sets: R[] = Array.isArray(r.datasets) ? r.datasets : [];
  const dbl: R[] = Array.isArray(r.doubling) ? r.doubling : [];
  const i = sets.findIndex((d, k) => d?.fit && num(dbl[k]?.value));
  if (i < 0) return null;
  const d = dbl[i], fit = sets[i].fit;
  const u = xUnit(t);
  const c = ci2(d.ci);
  const more = sets.filter((s, k) => s?.fit && num(dbl[k]?.value)).length > 1 ? " (first curve shown)" : "";
  const zw = String(fit.model ?? "").startsWith("zwietering_");
  return mk(`${String(sets[i].name ?? "The culture")}${more} doubles every ${fmt(d.value)}${u ? ` ${u}` : ""}`
    + `${c ? ` (95% CI ${fmt(c[0])} to ${fmt(c[1])})` : ""} ${zw ? "at its fastest, in the exponential phase" : "while it is still at low density"}`
    + ` (${String(d.how ?? "")} of the ${lower(String(fit.label ?? "growth model"))} fit).`,
  [SRC.sprouffske2016, SRC.zwietering1990],
  "the doubling time as the average over the whole curve. It is the fastest doubling, early in growth; the culture slows as it approaches its plateau, so the time to reach a given density is longer than the doubling time suggests.",
  "Growth model fitted by nonlinear least squares; the doubling time is ln 2 divided by the specific growth rate.");
}

/** Wound healing: the closure rate of each condition against the control. */
function woundMeaning(r: R, t: MeaningTable | null | undefined, style: PStyle): Meaning | null {
  const st = r.statistics;
  if (!st) return null;
  const u = xUnit(t) || "time unit";
  const per = r.rate_basis === "percent" ? `% of the initial wound area per ${u}` : ` area units per ${u}`;
  const cmp: R[] = Array.isArray(st.comparisons) ? st.comparisons.filter((c: R) => num(c?.difference)) : [];
  let a: string, b: string, d: number, ci: [number, number] | null, p: unknown, more = "";
  if (cmp.length) {
    a = String(cmp[0].first); b = String(cmp[0].second); d = cmp[0].difference; ci = ci2(cmp[0].ci); p = cmp[0].p_adjusted;
    more = cmp.length > 1 ? "; first comparison with the control shown, P adjusted for the comparisons" : "";
  } else if (num(st.difference) && Array.isArray(st.names)) {
    [a, b] = st.names.map(String); d = st.difference; ci = ci2(st.ci_difference); p = st.p_two_tailed;
  } else return null;
  const faster = d >= 0 ? "faster" : "slower";
  return mk(`The wound closed ${fmt(Math.abs(d))}${per} ${faster} in ${a} than in ${b}`
    + ` (difference ${fmt(d)}${ci ? `, ${ciText(ci)}` : ""}${more})`
    + `${pWords(p, style, "the conditions closed at the same rate", "a difference in closure rate")}.`,
  [SRC.jonkman2014, SRC.grada2017, SRC.lazic2010, ...sigSources(p)],
  "a faster closure as faster migration. Cells close a scratch by migrating and by dividing; and wells scratched in one experiment are not independent experiments.",
  typeof st.note === "string" ? st.note : undefined);
}

/** MIC: the MIC of one strain, or MIC50 / MIC90 across strains. */
function micMeaning(r: R, t: MeaningTable | null | undefined): Meaning | null {
  const strains: R[] = Array.isArray(r.strains) ? r.strains.filter((s: R) => s?.mic_label) : [];
  if (!strains.length) return null;
  const u = xUnit(t);
  const uu = u ? ` ${u}` : "";
  const mis = "an MIC as an exact concentration. It is the lowest concentration tested that stopped visible growth: "
    + "the true inhibitory concentration lies between it and the next lower concentration of the dilution series.";
  const test = "Broth microdilution: each series read at the first well without growth (CLSI M07); MIC50 and MIC90 from the ranked strain MICs (CLSI M39).";
  const cu = r.cumulative;
  if (strains.length > 1 && cu?.mic50_label) {
    const n = num(cu.n_strains) ? cu.n_strains : strains.length;
    const few = n < 10 ? "; CLSI M39 asks for at least 10 isolates before reporting MIC90" : "";
    return mk(`Across ${n} strains, MIC50 is ${String(cu.mic50_label)}${uu} and MIC90 ${String(cu.mic90_label ?? "n/a")}${uu}`
      + `${Array.isArray(cu.range) && cu.range.length === 2 ? ` (range ${cu.range[0]} to ${cu.range[1]})` : ""}: `
      + `half of the strains are inhibited at ${String(cu.mic50_label)}${uu} or less, and 90% at ${String(cu.mic90_label ?? "n/a")}${uu} or less${few}.`,
    [SRC.clsiM07, SRC.clsiM39], mis, test);
  }
  const s = strains[0];
  const reps: string[] = Array.isArray(s.replicate_mics) ? s.replicate_mics.map(String) : [];
  return mk(`The MIC of ${String(s.strain)} is ${String(s.mic_label)}${uu}`
    + `${reps.length ? ` (replicate series: ${reps.join(", ")}${s.within_one_dilution === true ? ", within one dilution of each other" : ""})` : ""}.`,
  [SRC.clsiM07], mis, test);
}

/** Kinetic plate reads: the initial rates per substrate concentration. */
function kineticMeaning(r: R): Meaning | null {
  const samples: R[] = Array.isArray(r.samples) ? r.samples.filter((s: R) => !s?.is_blank && num(s?.velocity_mean)) : [];
  if (!samples.length) return null;
  const how = r.method === "steepest" ? `the steepest slope over ${num(r.k) ? r.k : "a set number of"} consecutive reads`
    : r.method === "r2" ? `the longest stretch from the first read with R² ≥ ${num(r.min_r2) ? fmt(r.min_r2) : "the limit"}`
      : "the slope in the chosen time window";
  const first = samples[0], last = samples[samples.length - 1];
  const at = (s: R) => (num(s.substrate) ? `substrate ${fmt(s.substrate)}` : String(s.sample));
  const range = samples.length > 1 ? `from ${fmt(first.velocity_mean)} at ${at(first)} to ${fmt(last.velocity_mean)} at ${at(last)}`
    : `${fmt(first.velocity_mean)} at ${at(first)}`;
  const blank = r.blank ? `, with the “${String(r.blank)}” rate subtracted` : "";
  const mm = r.michaelis_menten_ready ? "; the linked substrate-rate table is ready for a Michaelis-Menten fit, which estimates Km and Vmax" : "";
  return mk(`The initial rates (mean of each sample's wells) run ${range}, each from ${how}${blank}${mm}.`,
    [SRC.bisswanger2014],
    "a rate over the whole trace as the initial rate. Substrate depletion, product inhibition and detector saturation bend a progress curve; only its early, linear part gives the initial rate that Michaelis-Menten kinetics needs.",
    "Initial rates: a straight line through the early part of each well's progress curve.");
}

/** Synergy: the summary score of each model shown, with SynergyFinder's
 *  reading of it. */
function synergyMeaning(r: R, o: R, style: PStyle): Meaning | null {
  const scores: R = r.scores ?? {};
  const names: Record<string, string> = { hsa: "HSA", bliss: "Bliss", loewe: "Loewe", zip: "ZIP" };
  const shown = Object.keys(names).filter((m) => num(scores[m]) && (o.models?.[m] ?? true) !== false);
  if (!shown.length) return null;
  const parts = shown.map((m) => {
    const p = r.models?.[m]?.p_value;
    return `${names[m]} ${fmt(scores[m])} (${scoreReading(scores[m])}${num(p) ? `, ${P(p, style)}` : ""})`;
  });
  const reads = new Set(shown.map((m) => scoreReading(scores[m])));
  const drugs = r.drug1 && r.drug2 ? ` of ${String(r.drug1)} and ${String(r.drug2)}` : "";
  return mk(`Averaged over the combination matrix${drugs}, the synergy scores are ${list(parts)}`
    + `${reads.size > 1 ? "; the models disagree, so the call depends on which definition of no interaction applies" : ""}.`
    + ` A score is the mean excess of the observed over the expected ${String(r.response_scale ?? "response")}, in percentage points.`,
  [SRC.ianevski2017, SRC.yadav2015, SRC.bliss1939],
  "a synergy score as a property of the drugs. It depends on the reference model (HSA, Bliss, Loewe and ZIP define no interaction differently) and averages over the doses tested; the landscape shows where in the matrix the synergy sits.",
  "Synergy scoring: each model's expected response from the single-drug curves, compared with the observed combination responses.");
}

/** Area under the curve of each data set, and their comparison. */
function aucMeaning(r: R, style: PStyle): Meaning | null {
  const sets: R[] = Array.isArray(r.datasets) ? r.datasets.filter((d: R) => !d?.error) : [];
  const val = (d: R) => (num(d.mean) ? d.mean : d.area);
  const ok = sets.filter((d) => num(val(d)));
  if (!ok.length) return null;
  const exp = r.replicates === "experiments";
  const one = (d: R) => `${String(d.name)} ${fmt(val(d))}${ci2(d.ci) ? ` (95% CI ${fmt(d.ci[0])} to ${fmt(d.ci[1])})` : ""}`;
  const shown = ok.slice(0, 4).map(one);
  let cmpT = "";
  let p: unknown = null;
  const c = r.comparison;
  if (c) {
    p = c.p ?? c.t_test?.p ?? c.anova?.p;
    const names: string[] = Array.isArray(c.names) ? c.names.map(String) : [];
    const diff = c.difference ?? c.t_test?.difference;
    const dT = num(diff) && names.length === 2 ? `${names[0]} − ${names[1]} = ${fmt(diff)}, ` : "";
    if (num(p)) {
      cmpT = p < ALPHA ? `; the areas differ (${dT}${String(c.test ?? "comparison")}, ${P(p, style)})`
        : `; the data do not show that the areas differ (${dT}${String(c.test ?? "comparison")}, ${P(p, style)})`;
    }
  }
  return mk(`The area under the curve is ${list(shown)}${exp ? ", each the mean of one area per experiment" : ""}`
    + `${ok.length > 4 ? " (first four data sets shown)" : ""}${cmpT}.`,
  [SRC.gpAuc, SRC.bailer1988, ...(num(p) ? sigSources(p) : [])],
  "equal areas as equal curves. The area sums the whole curve above the baseline: an early high peak and a late low plateau can give the same area, and another baseline gives another area.",
  "Area under the curve by the trapezoid rule; its SE and CI from the replicates.");
}

/** Volcano table: how many rows pass both thresholds, and what the
 *  adjustment controls. */
function volcanoMeaning(r: R, o: R): Meaning | null {
  const c = r.counts;
  if (!c || !num(c.up) || !num(c.down)) return null;
  const n = (num(c.ns) ? c.ns : 0) + c.up + c.down;
  const alpha = String(o.alpha ?? "0.05").trim() || "0.05";
  const fc = String(o.fcThreshold ?? "1").trim() || "1";
  const method = String(r.method ?? "");
  const fdr = method === "bh" || method === "bky" || method === "by" || method === "given";
  const label = method === "given" ? "the adjusted P column as given" : (FDR_LABEL as Record<string, string>)[method] ?? method;
  const pWord = method === "none" ? "P" : "adjusted P";
  const mis = method === "none"
    ? "a hit list from unadjusted P values as a list of real changes. With many rows tested, P below the threshold also picks up rows that changed by chance; adjust for the number of rows (false discovery rate) before calling hits."
    : fdr ? `a hit list as a list of real changes. Controlling the false discovery rate at ${alpha} means that, on average, up to that share of the hits is expected to be false; and a row that is not a hit is not shown to be unchanged.`
      : "a row that is not a hit as unchanged. A family-wise adjustment is strict: it misses changes, so not passing it does not show a row did not change.";
  return mk(`Of ${n} rows, ${c.up} ${c.up === 1 ? "is" : "are"} up and ${c.down} down: ${pWord} below ${alpha}${method !== "none" ? ` (${label})` : ""} `
    + `and |log2 fold change| at least ${fc}.${num(r.omitted) && r.omitted ? ` ${r.omitted} rows without a fold change or a P value were left out.` : ""}`,
  [SRC.benjaminiHochberg1995], mis,
  "Volcano plot: each row's fold change against its P value, with a threshold on each.");
}

/** Clustered heat map: how the rows were grouped, and what clustering
 *  can and cannot show. */
function clusterMeaning(r: R, o: R): Meaning | null {
  if (!r.rows && !r.columns && !r.kmeans) return null;
  const nRows = Array.isArray(r.row_names) ? r.row_names.length : null;
  const link = (LINKAGE_LABEL as Record<string, string>)[r.method] ?? String(r.method ?? "");
  const metric = (METRIC_LABEL as Record<string, string>)[r.metric] ?? String(r.metric ?? "");
  const scaled = r.scale === "zscore" ? ` of ${r.scale_axis === "columns" ? "column" : "row"} z-scores`
    : r.scale === "center" ? " of centred values" : "";
  const k = num(Number(o.kRows)) && Number(o.kRows) > 0 && Array.isArray(r.rows?.clusters) ? Number(o.kRows) : null;
  const km = r.kmeans;
  const sil = num(km?.silhouette?.mean) ? `; k-means with k = ${km.k} has a mean silhouette width of ${fmt(km.silhouette.mean)} (1 is well separated, near 0 overlapping)` : "";
  const sug = r.choose_k?.suggested;
  const sugT = sug && (num(sug.silhouette) || num(sug.gap)) ? `; the silhouette suggests k = ${sug.silhouette ?? "n/a"} and the gap statistic k = ${sug.gap ?? "n/a"}` : "";
  return mk(`${nRows !== null ? `The ${nRows} rows were` : "The rows were"} ordered by ${lower(link)} linkage on ${metric} distances${scaled}`
    + `${k ? `, and the row tree cut into ${k} clusters` : ""}${sil}${sugT}.`,
  [SRC.rousseeuw1987, SRC.tibshirani2001],
  "clusters as groups the data show exist. Hierarchical clustering always returns a tree and a cut always gives clusters, even in random data; the silhouette width and the gap statistic say how well the data support a number of clusters.",
  "Hierarchical clustering: rows (and columns) joined step by step by the linkage rule, drawn as dendrograms beside the reordered heat map.");
}

/**
 * The "What this means" line of an assay module's result, or undefined
 * when the analysis is not one of these modules (meaning.ts goes on).
 */
export function assayMeaning(analysisId: string | undefined, r: R, o: R, t: MeaningTable | null | undefined,
  style: PStyle): Meaning | null | undefined {
  switch (analysisId) {
    case "assay_stdcurve": return stdcurveMeaning(r);
    case "assay_plate": return plateMeaning(r);
    case "assay_flow": return flowMeaning(r);
    case "assay_densitometry":
      return ratioMeaning(r, "The normalised target signal", "blot", [SRC.degasperi2014, SRC.gpRatioPaired], style,
        "a fold change of band intensity as a fold change in protein. It assumes the bands are in the linear range of detection and that the loading reference does not change with treatment.");
    case "assay_luciferase":
      return ratioMeaning(r, "The firefly / Renilla ratio", r.unit === "experiment" ? "experiment" : "well",
        [SRC.gpRatioPaired, SRC.lazic2010], style,
        "a reporter ratio as promoter activity in the cell's own chromatin. It measures the transfected construct, normalised to the co-transfected Renilla control, which assumes the treatment leaves Renilla unchanged.");
    case "growth_curves": return growthMeaning(r, t);
    case "assay_wound_healing": return woundMeaning(r, t, style);
    case "assay_mic": return micMeaning(r, t);
    case "assay_kinetic_rates": return kineticMeaning(r);
    case "synergy_matrix": return synergyMeaning(r, o, style);
    case "xy_auc": return aucMeaning(r, style);
    case "volcano_table": return volcanoMeaning(r, o);
    case "cluster_heatmap": return clusterMeaning(r, o);
    default: return undefined;
  }
}
