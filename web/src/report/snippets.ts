// Equivalent R and Python code for a result, with the data and the
// options of the analysis filled in, so a number can be cross-checked in
// another tool (or a reviewer can re-run it). Each snippet is the closest
// standard call; where its defaults differ from OpenDose (ties, CI method,
// df), a one-line caveat says so. Pure, unit-tested.
import { numericData } from "../project/table.ts";
import type { DataTableModel } from "../project/types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface Snippet {
  r: string;
  python: string;
  /** Where the defaults differ from OpenDose's numbers. */
  caveats: string[];
}

interface Data {
  names: string[];
  /** Every value of a data set, row-major (independent groups). */
  flat: number[][];
  /** First subcolumn down the rows, blanks as null (matched designs). */
  aligned: (number | null)[][];
  /** rows x data sets x replicates (grouped tables). */
  cells: (number | null)[][][];
  rowTitles: string[];
  x: (number | null)[];
}

function readData(t: DataTableModel): Data {
  const d = numericData(t);
  return {
    names: d.datasets.map((s, i) => s.name || `Group ${i + 1}`),
    flat: d.datasets.map((s) => s.ys.flat().filter((v): v is number => v !== null)),
    aligned: d.datasets.map((s) => s.ys.map((row) => row[0] ?? null)),
    cells: t.x.map((_, r) => d.datasets.map((s) => s.ys[r] ?? [])),
    rowTitles: t.x.map((_, r) => t.rowTitles[r]?.trim() || `Row ${r + 1}`),
    x: d.x,
  };
}

/** A safe identifier for R and Python: "Treated A" -> "treated_a". */
export function ident(name: string, i: number, used: Set<string>): string {
  let s = name.normalize("NFKD").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  if (!s || /^\d/.test(s)) s = `g${i + 1}${s ? `_${s}` : ""}`;
  if (["c", "t", "df", "d", "np", "pd", "stats", "fit", "if", "for", "in", "function", "lambda"].includes(s)) s = `${s}_`;
  let out = s;
  for (let k = 2; used.has(out); k++) out = `${s}_${k}`;
  used.add(out);
  return out;
}

const fmt = (v: number | null, na: string) => (v === null || !Number.isFinite(v) ? na : String(v));
const rVec = (vs: (number | null)[]) => `c(${vs.map((v) => fmt(v, "NA")).join(", ")})`;
const pyVec = (vs: (number | null)[]) => `np.array([${vs.map((v) => fmt(v, "np.nan")).join(", ")}])`;
const rStr = (s: string) => JSON.stringify(s);
const pyStr = (s: string) => JSON.stringify(s);

interface Vars { ids: string[]; r: string[]; py: string[] }

function vectors(names: string[], cols: (number | null)[][], which?: number[]): Vars {
  const used = new Set<string>();
  const idx = which ?? names.map((_, i) => i);
  const ids = idx.map((i) => ident(names[i], i, used));
  return {
    ids,
    r: idx.map((i, k) => `${ids[k]} <- ${rVec(cols[i] ?? [])}`),
    py: idx.map((i, k) => `${ids[k]} = ${pyVec(cols[i] ?? [])}`),
  };
}

/** A long data frame (value, group) from independent groups. */
function longFrame(names: string[], flat: number[][], idx?: number[]): { r: string; py: string } {
  const which = idx ?? names.map((_, i) => i);
  const values = which.flatMap((i) => flat[i] ?? []);
  const groups = which.flatMap((i) => (flat[i] ?? []).map(() => names[i]));
  const levels = which.map((i) => rStr(names[i])).join(", ");
  return {
    r: `d <- data.frame(\n  value = ${rVec(values)},\n  group = factor(c(${groups.map(rStr).join(", ")}),\n                 levels = c(${levels})))`,
    py: `df = pd.DataFrame({\n    "value": [${values.join(", ")}],\n    "group": [${groups.map(pyStr).join(", ")}]})`,
  };
}

/** Matched designs: one row per subject (data-table row) and condition. */
function longMatched(names: string[], aligned: (number | null)[][]): { r: string; py: string } {
  const n = Math.max(0, ...aligned.map((a) => a.length));
  const complete: number[] = [];
  for (let r = 0; r < n; r++) if (aligned.every((a) => a[r] !== null && a[r] !== undefined)) complete.push(r);
  const subj: number[] = [], cond: string[] = [], val: number[] = [];
  for (const r of complete) names.forEach((nm, i) => { subj.push(r + 1); cond.push(nm); val.push(aligned[i][r]!); });
  return {
    r: `long <- data.frame(\n  subject = factor(c(${subj.join(", ")})),\n  condition = factor(c(${cond.map(rStr).join(", ")}),\n                     levels = c(${names.map(rStr).join(", ")})),\n  value = c(${val.join(", ")}))`,
    py: `long = pd.DataFrame({\n    "subject": [${subj.join(", ")}],\n    "condition": [${cond.map(pyStr).join(", ")}],\n    "value": [${val.join(", ")}]})`,
  };
}

/** Grouped table as long data: row factor, column factor, value (and
 *  subject = subcolumn within a column, for repeated measures). */
function longGrouped(d: Data, rowName: string, colName: string): { r: string; py: string } {
  const rows: string[] = [], cols: string[] = [], vals: number[] = [], subj: string[] = [];
  d.cells.forEach((cell, r) => cell.forEach((reps, c) => reps.forEach((v, k) => {
    if (v === null) return;
    rows.push(d.rowTitles[r]); cols.push(d.names[c]); vals.push(v); subj.push(`${d.names[c]} ${k + 1}`);
  })));
  const rv = (xs: string[]) => xs.map(rStr).join(", ");
  return {
    r: `long <- data.frame(\n  ${rowName} = factor(c(${rv(rows)}), levels = c(${rv([...new Set(rows)])})),\n  ${colName} = factor(c(${rv(cols)}), levels = c(${rv([...new Set(cols)])})),\n  subject = factor(c(${rv(subj)})),\n  value = c(${vals.join(", ")}))`,
    py: `long = pd.DataFrame({\n    "${rowName}": [${rows.map(pyStr).join(", ")}],\n    "${colName}": [${cols.map(pyStr).join(", ")}],\n    "subject": [${subj.map(pyStr).join(", ")}],\n    "value": [${vals.join(", ")}]})`,
  };
}

const PY_HEAD = "import numpy as np\nimport pandas as pd\nfrom scipy import stats";

const EMMEANS_ADJUST: Record<string, string> = {
  tukey: "tukey", bonferroni: "bonferroni", sidak: "sidak", holm_sidak: "holm",
  fisher_lsd: "none", dunnett: "dunnettx", newman_keuls: "none",
};
const PINGOUIN_ADJUST: Record<string, string> = {
  bonferroni: "bonf", sidak: "sidak", holm_sidak: "holm", fisher_lsd: "none",
};

function twoGroupSnippet(r: R, d: Data, o: R): Snippet {
  const a = o.datasetA ?? o.dataset_a ?? 0, b = o.datasetB ?? o.dataset_b ?? 1;
  const paired = /paired|wilcoxon/.test(String(r.test));
  const v = vectors(d.names, paired ? d.aligned : d.flat, [a, b]);
  const [x, y] = v.ids;
  const caveats: string[] = [];
  let rc = "", pc = "";
  switch (r.test) {
    case "unpaired_t":
      rc = `t.test(${x}, ${y}, var.equal = TRUE)\neffectsize::cohens_d(${x}, ${y}, ci = 0.95)  # pooled SD; noncentral t CI`;
      pc = `print(stats.ttest_ind(${x}, ${y}, equal_var=True))\nimport pingouin as pg\nprint(pg.compute_effsize(${x}, ${y}, eftype="cohen"))`;
      caveats.push("t and the difference are for the first group minus the second; the results sentence names the higher group first.");
      break;
    case "welch_t":
      rc = `t.test(${x}, ${y}, var.equal = FALSE)  # Welch\neffectsize::cohens_d(${x}, ${y}, pooled_sd = FALSE, ci = 0.95)`;
      pc = `print(stats.ttest_ind(${x}, ${y}, equal_var=False))  # Welch`;
      caveats.push("The d CI here holds the average-SD standardizer fixed (approximate); effectsize uses its own approximation, so the CI may differ in the second decimal.");
      break;
    case "paired_t":
      rc = `t.test(${x}, ${y}, paired = TRUE)\neffectsize::cohens_d(${x}, ${y}, paired = TRUE, ci = 0.95)  # d_z`;
      pc = `print(stats.ttest_rel(${x}, ${y}, nan_policy="omit"))`;
      caveats.push("Rows with a missing value in either column are dropped, as here.");
      break;
    case "ratio_paired_t":
      rc = `res <- t.test(log10(${x}), log10(${y}), paired = TRUE)\nres; 10^res$estimate; 10^res$conf.int  # geometric mean ratio and CI`;
      pc = `res = stats.ttest_rel(np.log10(${x}), np.log10(${y}), nan_policy="omit")\nprint(res, 10 ** res.confidence_interval())`;
      break;
    case "mann_whitney":
      rc = `wilcox.test(${x}, ${y}, conf.int = TRUE, exact = TRUE)\neffsize::cliff.delta(${x}, ${y})`;
      pc = `print(stats.mannwhitneyu(${x}, ${y}, alternative="two-sided", method="${r.p_method === "exact" ? "exact" : "asymptotic"}"))`;
      caveats.push("With ties, R's wilcox.test falls back to the normal approximation; coin::wilcox_test(distribution = \"exact\") gives the exact P with ties.");
      caveats.push("R's Hodges-Lehmann CI is at the requested level; OpenDose reports the achieved level of the rank-based interval.");
      break;
    case "wilcoxon_matched_pairs":
      rc = `wilcox.test(${x}, ${y}, paired = TRUE, conf.int = TRUE)${o.zeroMethod === "pratt" ? "\n# Pratt's handling of zero differences: coin::wilcoxsign_test(..., zero.method = \"Pratt\")" : ""}`;
      pc = `print(stats.wilcoxon(${x}, ${y}, zero_method="${o.zeroMethod === "pratt" ? "pratt" : "wilcox"}", nan_policy="omit"))`;
      caveats.push("SciPy reports the smaller rank sum as W; OpenDose reports the sum of signed ranks.");
      break;
    case "kolmogorov_smirnov":
      rc = `ks.test(${x}, ${y}, exact = TRUE)`;
      pc = `print(stats.ks_2samp(${x}, ${y}, method="exact"))`;
      break;
    default:
      return none();
  }
  return { r: `${v.r.join("\n")}\n${rc}`, python: `${PY_HEAD}\n${v.py.join("\n")}\n${pc}`, caveats };
}

function oneWaySnippet(r: R, d: Data): Snippet {
  const lf = longFrame(d.names, d.flat);
  const vs = vectors(d.names, d.flat);
  const caveats: string[] = [];
  if (r.kind === "nonparametric") {
    const corrected = r.dunns?.corrected !== false;
    return {
      r: `${lf.r}\nkruskal.test(value ~ group, data = d)\nFSA::dunnTest(value ~ group, data = d, method = "${corrected ? "bonferroni" : "none"}")\nrstatix::kruskal_effsize(d, value ~ group)`,
      python: `${PY_HEAD}\n${vs.py.join("\n")}\nprint(stats.kruskal(${vs.ids.join(", ")}))\n${lf.py}\nimport scikit_posthocs as sp\nprint(sp.posthoc_dunn(df, val_col="value", group_col="group", p_adjust=${corrected ? "\"bonferroni\"" : "None"}))`,
      caveats: ["Dunn's test here corrects with the Bonferroni-type method of the GraphPad guide; FSA reports the same with method = \"bonferroni\"."],
    };
  }
  const mc = r.multiple_comparisons;
  const m = String(mc?.method ?? "");
  let post = "", ppost = "";
  if (m === "tukey") { post = "TukeyHSD(fit)"; ppost = `print(stats.tukey_hsd(${vs.ids.join(", ")}))`; }
  else if (m === "dunnett") {
    const ctrl = d.names[r.multiple_comparisons?.control_index ?? 0] ?? d.names[0];
    post = `DescTools::DunnettTest(value ~ group, data = d, control = ${rStr(ctrl)})`;
    const ci = d.names.indexOf(ctrl);
    ppost = `print(stats.dunnett(${vs.ids.filter((_, i) => i !== ci).join(", ")}, control=${vs.ids[ci]}))`;
  } else if (m) {
    post = `emmeans::emmeans(fit, pairwise ~ group, adjust = "${EMMEANS_ADJUST[m] ?? "none"}")`;
    ppost = `import pingouin as pg\nprint(pg.pairwise_tests(data=df, dv="value", between="group", padjust="${PINGOUIN_ADJUST[m] ?? "none"}"))`;
    if (m === "holm_sidak") caveats.push("emmeans and pingouin offer Holm (Bonferroni step-down), not Holm-Šídák; adjusted P values are slightly larger.");
    if (m !== "fisher_lsd") caveats.push("pingouin's pairwise tests use each pair's own SD, not the pooled ANOVA residual as here; emmeans matches.");
    if (m === "newman_keuls") caveats.push("Newman-Keuls: agricolae::SNK.test(fit, \"group\") reproduces the stepwise test.");
  }
  return {
    r: `${lf.r}\nfit <- aov(value ~ group, data = d)\nsummary(fit)\neffectsize::eta_squared(fit, partial = FALSE, ci = 0.95)${post ? `\n${post}` : ""}`,
    python: `${PY_HEAD}\n${vs.py.join("\n")}\nprint(stats.f_oneway(${vs.ids.join(", ")}))\n${lf.py}${ppost ? `\n${ppost}` : ""}`,
    caveats: ["effectsize's η² CI is one-sided by default for ANOVA (alternative = \"greater\"); add alternative = \"two.sided\" to match the 95% CI here.", ...caveats],
  };
}

function none(): Snippet { return { r: "", python: "", caveats: [] }; }

/**
 * R and Python code reproducing a result. `analysis` is the results
 * sheet's analysis id (for analyses whose result does not say what it is).
 */
export function snippetsFor(result: unknown, options: unknown, table: DataTableModel): Snippet {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error) return none();
  const o = (options && typeof options === "object" ? options : {}) as R;
  const d = readData(table);
  try {
    switch (r.analysis) {
      case "ttest": return twoGroupSnippet(r, d, o);
      case "anova": return oneWaySnippet(r, d);
      case "anova_unequal_var": {
        const lf = longFrame(d.names, d.flat);
        const gh = r.multiple_comparisons?.method === "games_howell";
        return {
          r: `${lf.r}\noneway.test(value ~ group, data = d, var.equal = FALSE)  # Welch\nonewaytests::bf.test(value ~ group, data = d)  # Brown-Forsythe${gh ? "\nrstatix::games_howell_test(d, value ~ group)" : ""}`,
          python: `${PY_HEAD}\nimport pingouin as pg\n${lf.py}\nprint(pg.welch_anova(data=df, dv="value", between="group"))${gh ? "\nprint(pg.pairwise_gameshowell(data=df, dv=\"value\", between=\"group\"))" : ""}`,
          caveats: [],
        };
      }
      case "rm_one_way_anova": {
        const lm = longMatched(d.names, d.aligned);
        return {
          r: `${lm.r}\nafex::aov_ez(id = "subject", dv = "value", data = long, within = "condition",\n             anova_table = list(correction = "GG", es = "pes"))`,
          python: `${PY_HEAD}\nimport pingouin as pg\n${lm.py}\nprint(pg.rm_anova(data=long, dv="value", within="condition", subject="subject",\n                  correction=True, effsize="np2"))`,
          caveats: ["Only complete rows (a value in every column) enter, as here."],
        };
      }
      case "friedman": {
        const vs = vectors(d.names, d.aligned);
        return {
          r: `${vs.r.join("\n")}\nm <- cbind(${vs.ids.join(", ")})\nfriedman.test(m[complete.cases(m), ])`,
          python: `${PY_HEAD}\n${vs.py.join("\n")}\nm = np.column_stack([${vs.ids.join(", ")}])\nm = m[~np.isnan(m).any(axis=1)]\nprint(stats.friedmanchisquare(*m.T))`,
          caveats: r.p_method === "exact" ? ["R and SciPy give the chi-square approximation; the exact P here comes from the permutation distribution."] : [],
        };
      }
      case "two_way_anova":
      case "three_way_anova": {
        const lg = longGrouped(d, "row", "column");
        const adj = EMMEANS_ADJUST[String(r.multiple_comparisons?.method ?? "")] ?? null;
        return {
          r: `${lg.r}\nfit <- lm(value ~ row * column, data = long,\n          contrasts = list(row = contr.sum, column = contr.sum))\ncar::Anova(fit, type = 3)\neffectsize::eta_squared(car::Anova(fit, type = 3), partial = TRUE, alternative = "two.sided")${adj ? `\nemmeans::emmeans(fit, pairwise ~ column | row, adjust = "${adj}")` : ""}`,
          python: `${PY_HEAD}\nimport statsmodels.api as sm\nimport statsmodels.formula.api as smf\n${lg.py}\nfit = smf.ols("value ~ C(row, Sum) * C(column, Sum)", data=long).fit()\nprint(sm.stats.anova_lm(fit, typ=3))`,
          caveats: r.analysis === "three_way_anova" ? ["Three-way: add the third factor to the formula from the Layout's factor B and C assignment."] : [],
        };
      }
      case "rm_two_way_mixed":
      case "rm_two_way_both": {
        const lg = longGrouped(d, "row", "column");
        const both = r.analysis === "rm_two_way_both";
        return {
          r: `${lg.r}\nafex::aov_ez(id = "subject", dv = "value", data = long, within = ${both ? "c(\"row\", \"column\")" : "\"row\""},${both ? "" : " between = \"column\","}\n             anova_table = list(correction = "GG", es = "pes"))`,
          python: `${PY_HEAD}\nimport pingouin as pg\n${lg.py}\n${both ? "print(pg.rm_anova(data=long, dv=\"value\", within=[\"row\", \"column\"], subject=\"subject\"))"
            : "print(pg.mixed_anova(data=long, dv=\"value\", within=\"row\", between=\"column\",\n                     subject=\"subject\", correction=True))"}`,
          caveats: both ? ["For both factors repeated, subjects must be the same across columns: rename the subject column so equal subcolumns share an id."] : [],
        };
      }
      case "multiple_row_tests": {
        const a = o.datasetA ?? 0, b = o.datasetB ?? 1;
        const welch = r.test === "welch";
        const rows = d.cells.map((cell, i) => `  ${rStr(d.rowTitles[i])} = list(${rVec((cell[a] ?? []).filter((v) => v !== null))}, ${rVec((cell[b] ?? []).filter((v) => v !== null))})`);
        const pyRows = d.cells.map((cell, i) => `    ${pyStr(d.rowTitles[i])}: ([${(cell[a] ?? []).filter((v) => v !== null).join(", ")}], [${(cell[b] ?? []).filter((v) => v !== null).join(", ")}])`);
        const m = String(r.method ?? "holm_sidak");
        const rAdj = m === "bonferroni" ? "bonferroni" : m === "holm_sidak" ? "holm" : m === "bh" ? "BH" : m === "none" ? "none" : "BH";
        const pyAdj = m === "bonferroni" ? "bonferroni" : m === "holm_sidak" ? "holm-sidak" : m === "sidak" ? "sidak" : m === "none" ? null : m === "bky" || m === "two_stage" ? "fdr_tsbky" : "fdr_bh";
        return {
          r: `rows <- list(\n${rows.join(",\n")})\np <- sapply(rows, function(r) t.test(r[[1]], r[[2]], var.equal = ${welch ? "FALSE" : "TRUE"})$p.value)\np.adjust(p, method = "${rAdj}")`,
          python: `${PY_HEAD}\nfrom statsmodels.stats.multitest import multipletests\nrows = {\n${pyRows.join(",\n")}}\np = [stats.ttest_ind(x, y, equal_var=${welch ? "False" : "True"}).pvalue for x, y in rows.values()]\n${pyAdj ? `print(multipletests(p, alpha=0.05, method="${pyAdj}"))` : "print(p)"}`,
          caveats: m === "holm_sidak" ? ["R's p.adjust has Holm, not Holm-Šídák; statsmodels' \"holm-sidak\" matches."] : [],
        };
      }
      case "correlation": {
        const a = o.datasetA ?? 0, b = o.datasetB ?? 1;
        const v = vectors(d.names, d.aligned, [a, b]);
        const sp = r.method === "spearman";
        return {
          r: `${v.r.join("\n")}\ncor.test(${v.ids[0]}, ${v.ids[1]}, method = "${sp ? "spearman" : "pearson"}")`,
          python: `${PY_HEAD}\n${v.py.join("\n")}\nok = ~(np.isnan(${v.ids[0]}) | np.isnan(${v.ids[1]}))\nprint(stats.${sp ? "spearmanr" : "pearsonr"}(${v.ids[0]}[ok], ${v.ids[1]}[ok]))`,
          caveats: sp ? ["cor.test and SciPy give no CI for Spearman's r; compare r and P only."] : [],
        };
      }
      case "contingency":
      case "mcnemar": {
        const counts = table.x.map((_, i) => table.datasets.map((s) => Number((s.rows[i]?.[0] ?? "").trim() || "0")));
        const rM = `m <- matrix(c(${counts.flat().join(", ")}), nrow = ${counts.length}, byrow = TRUE)`;
        const pM = `m = np.array(${JSON.stringify(counts)})`;
        if (r.analysis === "mcnemar") {
          return {
            r: `${rM}\nmcnemar.test(m, correct = FALSE)\nbinom.test(m[1, 2], m[1, 2] + m[2, 1])  # exact`,
            python: `import numpy as np\nfrom statsmodels.stats.contingency_tables import mcnemar\n${pM}\nprint(mcnemar(m, exact=True))`,
            caveats: [],
          };
        }
        const twoByTwo = counts.length === 2 && counts[0]?.length === 2;
        return {
          r: `${rM}\nchisq.test(m, correct = FALSE)${twoByTwo ? "\nfisher.test(m)" : ""}\neffectsize::cramers_v(m, alternative = "two.sided")`,
          python: `${PY_HEAD}\n${pM}\nprint(stats.chi2_contingency(m, correction=False))${twoByTwo ? "\nprint(stats.fisher_exact(m))" : ""}`,
          caveats: twoByTwo ? ["The odds ratio CI here is Baptista-Pike; fisher.test reports the conditional MLE with an exact CI, so they differ slightly."] : [],
        };
      }
      case "survival": {
        const time: number[] = [], event: number[] = [], group: string[] = [];
        numericData(table).datasets.forEach((s, i) => s.ys.forEach((row) => {
          if (row[0] === null || row[0] === undefined || row[1] === null || row[1] === undefined) return;
          time.push(row[0]); event.push(row[1]); group.push(d.names[i]);
        }));
        return {
          r: `library(survival)\nd <- data.frame(time = c(${time.join(", ")}),\n                event = c(${event.join(", ")}),\n                group = factor(c(${group.map(rStr).join(", ")})))\nsurvfit(Surv(time, event) ~ group, data = d)\nsurvdiff(Surv(time, event) ~ group, data = d)  # log-rank\ncoxph(Surv(time, event) ~ group, data = d)`,
          python: `import pandas as pd\nfrom lifelines.statistics import multivariate_logrank_test\ndf = pd.DataFrame({"time": [${time.join(", ")}], "event": [${event.join(", ")}],\n                   "group": [${group.map(pyStr).join(", ")}]})\nprint(multivariate_logrank_test(df["time"], df["group"], df["event"]).summary)`,
          caveats: ["The hazard ratio here is the Mantel-Haenszel (log-rank) estimate; coxph's is the partial-likelihood estimate, which differs slightly."],
        };
      }
      case "nested_t_test":
      case "nested_one_way_anova": {
        const vals: number[] = [], grp: string[] = [], sub: string[] = [];
        table.datasets.forEach((s, g) => s.rows.forEach((row) => row.forEach((cell, k) => {
          const v = Number(cell.trim());
          if (cell.trim() === "" || !Number.isFinite(v)) return;
          vals.push(v); grp.push(d.names[g]); sub.push(`${d.names[g]}: ${s.subTitles?.[k]?.trim() || k + 1}`);
        })));
        return {
          r: `long <- data.frame(value = c(${vals.join(", ")}),\n                   group = factor(c(${grp.map(rStr).join(", ")})),\n                   subcolumn = factor(c(${sub.map(rStr).join(", ")})))\nfit <- lmerTest::lmer(value ~ group + (1 | subcolumn), data = long, REML = TRUE)\nanova(fit, ddf = "Kenward-Roger")`,
          python: `import pandas as pd\nimport statsmodels.formula.api as smf\nlong = pd.DataFrame({"value": [${vals.join(", ")}],\n                     "group": [${grp.map(pyStr).join(", ")}],\n                     "subcolumn": [${sub.map(pyStr).join(", ")}]})\nprint(smf.mixedlm("value ~ group", long, groups=long["subcolumn"]).fit(reml=True).summary())`,
          caveats: ["statsmodels gives Wald z tests; lmerTest with Kenward-Roger df reproduces the F and df of a balanced nested design."],
        };
      }
      case "estimation": {
        const lf = longFrame(d.names, d.flat);
        const ctrl = r.plot?.order?.[0] ?? d.names[0];
        const order: string[] = r.plot?.order ?? d.names;
        const effect = String(r.effects?.[0] ?? "mean_diff");
        return {
          r: `${lf.r}\nlibrary(dabestr)\nb <- load(d, x = group, y = value, idx = c(${order.map(rStr).join(", ")}),\n          resamples = ${r.n_resamples ?? 5000}${r.paired ? ", paired = \"baseline\", id_col = subject" : ""})\n${effect}(b)  # control: ${ctrl}`,
          python: `import pandas as pd\nimport dabest\n${lf.py}\nb = dabest.load(df, x="group", y="value", idx=(${order.map(pyStr).join(", ")}),\n                resamples=${r.n_resamples ?? 5000}, random_seed=${r.seed ?? 12345})\nprint(b.${effect})`,
          caveats: ["Bootstrap CIs depend on the random number stream: another tool's CI agrees to about two significant digits, not exactly."],
        };
      }
      case "column_statistics": {
        const vs = vectors(d.names, d.flat);
        const mu = r.datasets?.[0]?.one_sample_t?.hypothetical;
        return {
          r: `${vs.r.join("\n")}\n${vs.ids.map((id) => `summary(${id}); sd(${id}); shapiro.test(${id})${mu !== undefined ? `; t.test(${id}, mu = ${mu})` : ""}`).join("\n")}`,
          python: `${PY_HEAD}\n${vs.py.join("\n")}\n${vs.ids.map((id) => `print(stats.describe(${id}), stats.shapiro(${id})${mu !== undefined ? `, stats.ttest_1samp(${id}, ${mu})` : ""})`).join("\n")}`,
          caveats: ["Percentiles: R's quantile type 7 (and NumPy's default) match the \"linear\" method here; GraphPad-style percentiles are type 6."],
        };
      }
      case "dose_response": {
        const xs: number[] = [], ys: number[] = [];
        const ds = numericData(table).datasets[0];
        ds?.ys.forEach((row, i) => row.forEach((v) => {
          const x = d.x[i];
          if (v !== null && x !== null && x !== undefined) { xs.push(x); ys.push(v); }
        }));
        const fit = r.datasets?.[0]?.fit;
        const logX = o.xIsLog === true;   // X entered as log10(concentration)
        return {
          r: `d <- data.frame(x = c(${xs.join(", ")}), response = c(${ys.join(", ")}))\nd$dose <- ${logX ? "10^d$x" : "d$x"}\nfit <- drc::drm(response ~ dose, data = d,\n                fct = drc::LL.4(names = c("Hill", "Bottom", "Top", "IC50")))\nsummary(fit); confint(fit)`,
          python: `import numpy as np\nfrom scipy.optimize import curve_fit\nx = np.array([${xs.join(", ")}])\ny = np.array([${ys.join(", ")}])\nlogx = ${logX ? "x" : "np.log10(x)"}\ndef four_pl(logx, top, bottom, logic50, hill):\n    return bottom + (top - bottom) / (1 + 10 ** ((logic50 - logx) * hill))\np, cov = curve_fit(four_pl, logx, y, p0=[y.max(), y.min(), np.median(logx), -1])\nprint(p, np.sqrt(np.diag(cov)))`,
          caveats: [`Model here: ${fit?.label ?? "the chosen model"}; the snippet is the four-parameter logistic. drc's LL.4 writes the slope as b = −HillSlope; IC50 and its CI agree.`],
        };
      }
      case "deming": {
        const xs = d.x.map((v) => v ?? NaN), ys = d.aligned[0] ?? [];
        return {
          r: `x <- ${rVec(xs.map((v) => (Number.isFinite(v) ? v : null)))}\ny <- ${rVec(ys)}\nmcr::mcreg(x, y, method.reg = "Deming", error.ratio = ${r.datasets?.[0]?.fit?.lambda ?? 1})`,
          python: `import numpy as np\nfrom scipy import odr\nx = ${pyVec(xs.map((v) => (Number.isFinite(v) ? v : null)))}\ny = ${pyVec(ys)}\nfit = odr.ODR(odr.RealData(x, y), odr.unilinear).run()\nfit.pprint()  # equal error variances (lambda = 1)`,
          caveats: ["Use method.ci = \"analytical\" in mcreg for closed-form CIs; resampling CIs differ slightly from the ones here."],
        };
      }
      default:
        return none();
    }
  } catch {
    return none();
  }
}
