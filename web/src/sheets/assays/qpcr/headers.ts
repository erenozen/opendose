// Column headers of qPCR Cq exports: which column holds the sample, the
// target, the Cq ... across instrument software (QuantStudio / StepOne /
// 7500, Bio-Rad CFX, LightCycler 96 / 480, Rotor-Gene, qTower) and
// hand-made tables. Headers are compared case-insensitively after
// normalisation ("Sample_Name", "sample name" and "SampleName" are one
// header; the Cyrillic "т" of StepOne's "Cт" reads as "t"). Per-well Cq
// columns win over replicate means ("CT" over "Ct Mean"). Pure, no
// imports: the import recipe and the qPCR module share it.

export type CqRole = "sample" | "target" | "cq" | "group" | "well" | "pair" | "quantity";

/** The roles a Cq export must have. */
export const CQ_CORE: readonly CqRole[] = ["sample", "target", "cq"];

/** Header aliases per role, normalised, in order of preference (each
 *  inner list is one tier: an earlier tier wins over a later one). */
export const CQ_ALIASES: Record<CqRole, string[][]> = {
  cq: [
    ["cq", "ct", "cp", "crt", "c t", "cq value", "ct value", "cp value", "cq drn", "ct drn", "cq rn", "ct rn",
      "threshold cycle", "quantification cycle", "cq raw", "ct raw"],
    ["cq mean", "ct mean", "cp mean", "mean cq", "mean ct", "mean cp", "cq avg", "ct avg", "avg cq", "avg ct",
      "average cq", "average ct", "cq average", "ct average"],
  ],
  target: [
    ["target", "target name", "targetname", "gene", "gene name", "genename", "gene symbol", "detector",
      "detector name", "assay", "assay name", "primer", "primer name", "primer set", "amplicon"],
  ],
  sample: [
    ["sample", "sample name", "samplename", "sample id", "sampleid", "sample title", "sample label",
      "biological replicate", "bio rep", "biorep"],
    ["well name", "wellname"],
    ["name"],
  ],
  well: [["well", "well position", "wellposition", "pos", "position", "well pos", "well id"]],
  group: [["group", "condition", "treatment", "biological group", "biogroup", "biological set name",
    "biological set", "sample group"]],
  pair: [["pair", "subject", "experiment", "donor", "animal", "run", "block"]],
  quantity: [["quantity", "starting quantity", "starting quantity sq", "sq", "copies", "copy number",
    "dilution", "conc", "concentration", "given conc"]],
};

/** A header as compared: lower case, "т" read as "t", parentheses
 *  dropped, separators (_ - . / :) as spaces, spaces collapsed. */
export function normalizeHeader(h: string): string {
  return String(h ?? "").normalize("NFKC").toLowerCase()
    .replace(/[тΤτ]/g, "t")
    .replace(/[()[\]]/g, " ")
    .replace(/[_\-./:#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The aliases of a role as regular expressions on the raw header, one
 *  per tier (for column-role pickers that test patterns): separators,
 *  parentheses and case are free, "t" also matches the Cyrillic "т". */
export function aliasPatterns(role: CqRole): RegExp[] {
  const sep = "[\\s_.\\-/:#()\\[\\]]*";
  const toRe = (a: string) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/t/g, "[tт]").replace(/ /g, sep);
  return CQ_ALIASES[role].map((tier) => new RegExp(`^\\s*(?:${tier.map(toRe).join("|")})[\\s)\\]]*$`, "i"));
}

/** Column index of each role (-1 = none). Roles are assigned in the
 *  order Cq, target, well, sample, group, pair, quantity, each to an
 *  unused column; when no sample column is found, the well column (or a
 *  "Well Name") doubles as the sample. */
export function resolveCqHeaders(headers: string[]): Record<CqRole, number> {
  const names = headers.map(normalizeHeader);
  const used = new Set<number>();
  const out = { sample: -1, target: -1, cq: -1, group: -1, well: -1, pair: -1, quantity: -1 } as Record<CqRole, number>;
  const take = (role: CqRole) => {
    for (const tier of CQ_ALIASES[role]) {
      const i = names.findIndex((n, j) => !used.has(j) && tier.includes(n));
      if (i >= 0) { out[role] = i; used.add(i); return; }
    }
  };
  for (const role of ["cq", "target", "well", "sample", "group", "pair", "quantity"] as CqRole[]) take(role);
  if (out.sample < 0 && out.well >= 0) out.sample = out.well;
  return out;
}

export interface CqHeader {
  /** Row of the matrix holding the headers. */
  row: number;
  headers: string[];
  idx: Record<CqRole, number>;
  /** Sample, target and Cq all found. */
  complete: boolean;
}

/** The header row of a Cq export: the first row (within `maxScan`) where
 *  sample, target and Cq are all found; else the row with the most core
 *  roles, as long as it has a Cq column or two core roles (null if none:
 *  then the caller can offer the first row for a manual mapping). */
export function findCqHeader(m: string[][], maxScan = 80): CqHeader | null {
  let best: CqHeader | null = null;
  let bestScore = 0;
  for (let r = 0; r < Math.min(m.length, maxScan); r++) {
    const headers = m[r] ?? [];
    if (!headers.some((c) => String(c ?? "").trim())) continue;
    const idx = resolveCqHeaders(headers);
    const found = CQ_CORE.filter((k) => idx[k] >= 0).length;
    if (found === 3) return { row: r, headers, idx, complete: true };
    const score = found + (idx.cq >= 0 ? 0.5 : 0);
    if ((idx.cq >= 0 || found >= 2) && score > bestScore) {
      best = { row: r, headers, idx, complete: false };
      bestScore = score;
    }
  }
  return best;
}

/** The mapping offered when the headers alone do not settle it: the
 *  header matches, then each missing core role takes the first unused
 *  column whose values fit (mostly numbers for the Cq, mostly text for
 *  the sample and the target). */
export function guessCqMapping(headers: string[], rows: string[][]): Record<CqRole, number> {
  const idx = resolveCqHeaders(headers);
  const used = new Set(Object.values(idx).filter((i) => i >= 0));
  const numericShare = (j: number) => {
    const vals = rows.slice(0, 200).map((r) => String(r[j] ?? "").trim()).filter(Boolean);
    if (!vals.length) return -1;
    return vals.filter((v) => Number.isFinite(Number(v.replace(",", ".")))).length / vals.length;
  };
  const pick = (role: CqRole, wantNumbers: boolean) => {
    if (idx[role] >= 0) return;
    const j = headers.findIndex((_, k) => {
      if (used.has(k)) return false;
      const share = numericShare(k);
      return share >= 0 && (wantNumbers ? share >= 0.5 : share < 0.5);
    });
    if (j >= 0) { idx[role] = j; used.add(j); }
  };
  pick("cq", true);
  pick("sample", false);
  pick("target", false);
  return idx;
}

/** Text an instrument writes for a well without a Cq ("Undetermined",
 *  "No Ct", Bio-Rad's "NaN", "N/A", "-" ...): anything that is not a
 *  number. Such wells are kept and the engine counts them as
 *  undetermined (missing). */
export function isUndeterminedCq(v: string): boolean {
  const s = String(v ?? "").trim();
  return s !== "" && !Number.isFinite(Number(s.replace(",", ".")));
}
