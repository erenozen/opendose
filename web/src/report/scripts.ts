// analysis.py and analysis.R for the export bundle (P-67): each script
// reads the bundle's long CSV files (data/<table>.long.csv, the values
// excluded in OpenDose left out by their `excluded` column) and re-runs
// every results sheet with the closest standard call: SciPy and
// statsmodels in Python, base R and well-known packages in R. Where the
// standard call does not compute what OpenDose computes (a correction,
// a CI method, a df rule), a "# Caveat:" line says so; where no standard
// call fits, the script says that instead of pretending.
//
// `python analysis.py --json` prints every number it computed as JSON,
// keyed by results sheet; __tests__/scripts.test.ts runs it on native
// engine fixtures and compares with the engine's numbers. analysis.R is
// checked as text only (R is not part of the test environment). Pure.
import type { DataTableModel } from "../project/types.ts";
import { tableToLong } from "../share/tidy.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface ScriptEntry {
  /** Results sheet name (the key of the script's output). */
  sheet: string;
  /** The results sheet's analysis id ("column", "nonlin", "quantal", ...). */
  analysisId: string;
  result: unknown;
  /** The results sheet's resolved options. */
  options: unknown;
  table: DataTableModel;
  /** The data table's name and its long CSV, as named in the bundle. */
  dataName: string;
  csv: string;
}

export interface ScriptMeta { title: string; app: string; date: string }

interface Part { py: string[]; r: string[]; caveats: string[] }

const q = (s: string) => JSON.stringify(s);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const names = (r: R): string[] => (Array.isArray(r.names) ? r.names.map(String) : []);

/** Column names of the long CSV that are fixed by the table type (share/tidy.ts). */
function keyOf(t: DataTableModel): string {
  switch (t.type) {
    case "column": case "survival": case "nested": return "Group";
    case "contingency": return "Outcome";
    case "partsofwhole": return "Column";
    default: return "Dataset";
  }
}

const none = (why: string): Part => ({ py: [`# ${why}`], r: [`# ${why}`], caveats: [] });

// ------------------------------------------------------------ per kind

function ttest(r: R, t: DataTableModel): Part {
  const [a, b] = names(r);
  if (!a || !b) return none("The two groups of this t test are not named in its result; nothing to re-run.");
  const k = q(keyOf(t));
  const paired = /paired|wilcoxon/.test(String(r.test));
  const multi = (t.datasets[0]?.rows[0]?.length ?? 1) > 1;
  const caveats: string[] = [];
  if (paired && multi) caveats.push("The pairs are matched by row here, as OpenDose matches them, using the first subcolumn only.");
  const py = [paired
    ? `a, b = paired(d, ${q(a)}, ${q(b)}, key=${k})`
    : `a, b = group(d, ${q(a)}, key=${k}), group(d, ${q(b)}, key=${k})`];
  const rr = [paired
    ? `w <- paired(d, ${q(a)}, ${q(b)}, key = ${k}); a <- w$a; b <- w$b`
    : `a <- group(d, ${q(a)}, key = ${k}); b <- group(d, ${q(b)}, key = ${k})`];
  switch (r.test) {
    case "unpaired_t":
    case "welch_t": {
      const eq = r.test === "unpaired_t";
      py.push(`res = stats.ttest_ind(a, b, equal_var=${eq ? "True" : "False"})`,
        "ci = res.confidence_interval(0.95)",
        "report(SHEET, t=res.statistic, df=res.df, p=res.pvalue, difference=a.mean() - b.mean(),",
        "       ci=[ci.low, ci.high])");
      rr.push(`print(t.test(a, b, var.equal = ${eq ? "TRUE" : "FALSE"}))`);
      break;
    }
    case "paired_t":
      py.push("res = stats.ttest_rel(a, b)", "ci = res.confidence_interval(0.95)",
        "report(SHEET, t=res.statistic, df=res.df, p=res.pvalue, difference=(a - b).mean(),",
        "       ci=[ci.low, ci.high])");
      rr.push("print(t.test(a, b, paired = TRUE))");
      break;
    case "ratio_paired_t":
      py.push("res = stats.ttest_rel(np.log10(a), np.log10(b))", "ci = res.confidence_interval(0.95)",
        "report(SHEET, t=res.statistic, df=res.df, p=res.pvalue,",
        "       ratio=10 ** (np.log10(a) - np.log10(b)).mean(), ci=[10 ** ci.low, 10 ** ci.high])");
      rr.push("res <- t.test(log10(a), log10(b), paired = TRUE)", "print(res); print(10^res$estimate); print(10^res$conf.int)");
      break;
    case "mann_whitney":
      py.push(`res = stats.mannwhitneyu(a, b, alternative="two-sided", method="${r.p_method === "exact" ? "exact" : "asymptotic"}")`,
        "u = min(res.statistic, len(a) * len(b) - res.statistic)",
        "report(SHEET, U=u, p=res.pvalue, hodges_lehmann=np.median(np.subtract.outer(a, b)))");
      rr.push(`print(wilcox.test(a, b, conf.int = TRUE, exact = ${r.p_method === "exact" ? "TRUE" : "FALSE"}))`);
      caveats.push("With ties, R's wilcox.test cannot give the exact P; coin::wilcox_test(distribution = \"exact\") can.");
      caveats.push("The Hodges-Lehmann CI here is at the level the ranks achieve; R's is at the level asked for.");
      break;
    case "wilcoxon_matched_pairs":
      py.push(`res = stats.wilcoxon(a, b, zero_method="${r.zero_method === "pratt" ? "pratt" : "wilcox"}")`,
        "report(SHEET, p=res.pvalue, smaller_rank_sum=res.statistic)");
      rr.push("print(wilcox.test(a, b, paired = TRUE, conf.int = TRUE))");
      caveats.push("SciPy reports the smaller rank sum; OpenDose reports W, the sum of the signed ranks.");
      break;
    case "kolmogorov_smirnov":
      py.push(`res = stats.ks_2samp(a, b, method="${r.p_method === "exact" ? "exact" : "asymp"}")`,
        "report(SHEET, D=res.statistic, p=res.pvalue)");
      rr.push("print(ks.test(a, b))");
      break;
    default:
      return none(`No standard call is written for this test (${String(r.test)}).`);
  }
  return { py, r: rr, caveats };
}

function oneWay(r: R, t: DataTableModel): Part {
  const groups = Array.isArray(r.group_summaries) ? r.group_summaries.map((g: R) => String(g.name)) : names(r);
  const k = q(keyOf(t));
  const list = `[${groups.map(q).join(", ")}]`;
  const py = [`gs = [group(d, g, key=${k}) for g in ${list}]`];
  const rr = [`d$g <- factor(d[[${k}]], levels = c(${groups.map(q).join(", ")}))`,
    `d$y <- as.numeric(d$Value)`, "d <- d[!is.na(d$y) & !is.na(d$g), ]"];
  const caveats: string[] = [];
  if (r.kind === "nonparametric") {
    py.push("res = stats.kruskal(*gs)", "report(SHEET, H=res.statistic, p=res.pvalue)");
    rr.push("print(kruskal.test(y ~ g, data = d))", "# Dunn's test: FSA::dunnTest(y ~ g, data = d, method = \"bonferroni\")");
    caveats.push("Dunn's multiple comparisons are not in SciPy; scikit-posthocs' posthoc_dunn(p_adjust=\"bonferroni\") reproduces them.");
    if (r.p_method === "exact") caveats.push("OpenDose's P here is exact (permutation); SciPy's is the chi-square approximation.");
    return { py, r: rr, caveats };
  }
  py.push("res = stats.f_oneway(*gs)");
  rr.push("fit <- aov(y ~ g, data = d)", "print(summary(fit))");
  const m = String(r.multiple_comparisons?.method ?? "");
  const pairs: string[] = [];
  groups.forEach((_a: string, i: number) => groups.slice(i + 1).forEach((_b: string, j: number) => pairs.push(`(${i}, ${i + 1 + j})`)));
  if (m === "tukey") {
    py.push(`G = ${list}`, "hsd = stats.tukey_hsd(*gs)",
      `pairs = {f"{G[i]} vs. {G[j]}": hsd.pvalue[i, j] for i, j in [${pairs.join(", ")}]}`,
      "report(SHEET, F=res.statistic, p=res.pvalue, tukey_p=pairs)");
    rr.push("print(TukeyHSD(fit))");
  } else if (m === "dunnett") {
    const ci = num(r.multiple_comparisons?.control_index) ? r.multiple_comparisons.control_index : 0;
    caveats.push("SciPy's dunnett integrates the multivariate t by quasi-Monte Carlo: P values below about 0.001 "
      + "agree with OpenDose's (numerical integration) only to about 1e-5 in absolute terms.");
    py.push(`ctrl = ${ci}`, "dn = stats.dunnett(*[g for i, g in enumerate(gs) if i != ctrl], control=gs[ctrl], random_state=0)",
      "report(SHEET, F=res.statistic, p=res.pvalue, dunnett_p=list(dn.pvalue))");
    rr.push(`print(DescTools::DunnettTest(y ~ g, data = d, control = ${q(groups[ci] ?? groups[0])}))`);
  } else {
    py.push("report(SHEET, F=res.statistic, p=res.pvalue)");
    if (m) {
      caveats.push(`The ${m.replace(/_/g, " ")} comparisons are not re-run here: emmeans::emmeans(fit, pairwise ~ g, adjust = ...) in R `
        + "uses the same pooled SD; SciPy has no such call.");
    }
  }
  return { py, r: rr, caveats };
}

function welchAnova(r: R, t: DataTableModel): Part {
  const groups = Array.isArray(r.group_summaries) ? r.group_summaries.map((g: R) => String(g.name)) : names(r);
  const k = q(keyOf(t));
  return {
    py: [`gs = [group(d, g, key=${k}) for g in [${groups.map(q).join(", ")}]]`,
      "from statsmodels.stats.oneway import anova_oneway",
      "w = anova_oneway(gs, use_var=\"unequal\", welch_correction=True)",
      "bf = anova_oneway(gs, use_var=\"bf\")",
      "report(SHEET, welch_F=w.statistic, welch_p=w.pvalue, welch_df=list(w.df),",
      "       bf_F=bf.statistic, bf_p=bf.pvalue)"],
    r: [`d$g <- factor(d[[${k}]]); d$y <- as.numeric(d$Value)`, "print(oneway.test(y ~ g, data = d, var.equal = FALSE))"],
    caveats: ["Games-Howell comparisons: pingouin.pairwise_gameshowell in Python, rstatix::games_howell_test in R."],
  };
}

function rmOneWay(r: R, t: DataTableModel): Part {
  const groups = names(r);
  const k = q(keyOf(t));
  return {
    py: ["from statsmodels.stats.anova import AnovaRM",
      `w = wide(d, [${groups.map(q).join(", ")}], key=${k})`,
      "long = w.reset_index().melt(id_vars=\"Replicate\", var_name=\"condition\", value_name=\"y\")",
      "tab = AnovaRM(long, \"y\", \"Replicate\", within=[\"condition\"]).fit().anova_table",
      "report(SHEET, F=tab[\"F Value\"].iloc[0], p_sphericity_assumed=tab[\"Pr > F\"].iloc[0])"],
    r: [`d$y <- as.numeric(d$Value); d$condition <- factor(d[[${k}]]); d$subject <- factor(d$Replicate)`,
      "print(afex::aov_ez(id = \"subject\", dv = \"y\", data = d, within = \"condition\",",
      "                   anova_table = list(correction = \"GG\")))"],
    caveats: ["statsmodels' AnovaRM assumes sphericity; OpenDose's headline P is Geisser-Greenhouse corrected (afex in R applies it)."],
  };
}

function friedman(r: R, t: DataTableModel): Part {
  const groups = names(r);
  return {
    py: [`w = wide(d, [${groups.map(q).join(", ")}], key=${q(keyOf(t))})`,
      "res = stats.friedmanchisquare(*[w[c].to_numpy() for c in w.columns])",
      "report(SHEET, statistic=res.statistic, p=res.pvalue)"],
    r: [`w <- wide(d, c(${groups.map(q).join(", ")}), key = ${q(keyOf(t))})`, "print(friedman.test(as.matrix(w)))"],
    caveats: r.p_method === "exact" ? ["OpenDose's P here is exact; SciPy and R give the chi-square approximation."] : [],
  };
}

function twoWay(): Part {
  return {
    py: ["import statsmodels.api as sm", "import statsmodels.formula.api as smf",
      "d = d.assign(y=pd.to_numeric(d[\"Value\"], errors=\"coerce\")).dropna(subset=[\"y\"])",
      "fit = smf.ols(\"y ~ C(Row, Sum) * C(Dataset, Sum)\", data=d).fit()",
      "tab = sm.stats.anova_lm(fit, typ=3)",
      "report(SHEET, F_rows=tab.loc[\"C(Row, Sum)\", \"F\"], p_rows=tab.loc[\"C(Row, Sum)\", \"PR(>F)\"],",
      "       F_columns=tab.loc[\"C(Dataset, Sum)\", \"F\"], p_columns=tab.loc[\"C(Dataset, Sum)\", \"PR(>F)\"],",
      "       F_interaction=tab.loc[\"C(Row, Sum):C(Dataset, Sum)\", \"F\"],",
      "       p_interaction=tab.loc[\"C(Row, Sum):C(Dataset, Sum)\", \"PR(>F)\"])"],
    r: ["d$y <- as.numeric(d$Value); d$Row <- factor(d$Row); d$Dataset <- factor(d$Dataset)",
      "fit <- lm(y ~ Row * Dataset, data = d, contrasts = list(Row = contr.sum, Dataset = contr.sum))",
      "print(car::Anova(fit, type = 3))"],
    caveats: ["Post hoc comparisons: emmeans::emmeans(fit, pairwise ~ Dataset | Row, adjust = ...) in R."],
  };
}

function correlation(r: R, t: DataTableModel): Part {
  const [a, b] = names(r);
  if (!a || !b || r.method === "rm_corr") return none("No standard call is written for this correlation.");
  const fn = r.method === "spearman" ? "spearmanr" : r.method === "kendall" ? "kendalltau" : "pearsonr";
  return {
    py: [`x, y = paired(d, ${q(a)}, ${q(b)}, key=${q(keyOf(t))})`, `res = stats.${fn}(x, y)`,
      "report(SHEET, r=res.statistic, p=res.pvalue, n=len(x))"],
    r: [`w <- paired(d, ${q(a)}, ${q(b)}, key = ${q(keyOf(t))})`,
      `print(cor.test(w$a, w$b, method = "${r.method === "spearman" ? "spearman" : r.method === "kendall" ? "kendall" : "pearson"}"))`],
    caveats: [],
  };
}

function contingency(r: R): Part {
  const two = r.rows === 2 && r.cols === 2;
  return {
    py: ["d = d.assign(n=pd.to_numeric(d[\"Count\"], errors=\"coerce\").fillna(0))",
      "m = d.pivot_table(index=\"Row\", columns=\"Outcome\", values=\"n\", aggfunc=\"sum\", sort=False).fillna(0).to_numpy()",
      "chi2, p, dof, _ = stats.chi2_contingency(m, correction=False)",
      ...(two ? ["fisher = stats.fisher_exact(m)", "report(SHEET, chi2=chi2, df=dof, p=p, fisher_p=fisher.pvalue)"]
        : ["report(SHEET, chi2=chi2, df=dof, p=p)"])],
    r: ["d$n <- as.numeric(d$Count)", "m <- xtabs(n ~ factor(Row, unique(Row)) + factor(Outcome, unique(Outcome)), data = d)",
      "print(chisq.test(m, correct = FALSE))", ...(two ? ["print(fisher.test(m))"] : [])],
    caveats: two ? ["The odds ratio CI here is Baptista-Pike; fisher.test's is the conditional MLE's exact CI."] : [],
  };
}

function survival(r: R): Part {
  const groups = Array.isArray(r.logrank?.group_names) ? r.logrank.group_names.map(String) : Object.keys(r.curves ?? {});
  if (groups.length !== 2) {
    return { py: ["# The log-rank test of more than two groups is not in SciPy: lifelines' multivariate_logrank_test is."],
      r: ["library(survival)", "d$time <- as.numeric(d$Time); d$event <- as.numeric(d$Event)",
        "print(survdiff(Surv(time, event) ~ Group, data = d))"], caveats: [] };
  }
  return {
    py: ["d = d.assign(time=pd.to_numeric(d[\"Time\"], errors=\"coerce\"), event=pd.to_numeric(d[\"Event\"], errors=\"coerce\"))",
      "d = d.dropna(subset=[\"time\", \"event\"])",
      "def censored(g):",
      "    s = d[d[\"Group\"] == g]",
      "    return stats.CensoredData.right_censored(s[\"time\"].to_numpy(), s[\"event\"].to_numpy() == 0)",
      `res = stats.logrank(censored(${q(groups[0])}), censored(${q(groups[1])}))`,
      "report(SHEET, chi2=res.statistic ** 2, p=res.pvalue)"],
    r: ["library(survival)", "d$time <- as.numeric(d$Time); d$event <- as.numeric(d$Event)",
      "print(survdiff(Surv(time, event) ~ Group, data = d))  # log-rank",
      "print(coxph(Surv(time, event) ~ Group, data = d))"],
    caveats: ["SciPy's log-rank statistic (squared here) is the variance form, as R's survdiff reports it: OpenDose's "
      + "results show it as chi2_variance, while its headline chi-square is the Peto form, which is never larger.",
    "The hazard ratio here is the Mantel-Haenszel (log-rank) estimate; coxph's is the partial-likelihood estimate."],
  };
}

function dose(r: R, t: DataTableModel, o: R): Part {
  const sets: R[] = Array.isArray(r.datasets) ? r.datasets : [];
  const xcol = t.xTitle || "X";
  const py: string[] = [], rr: string[] = [];
  const caveats: string[] = [];
  // the app's option (default false: X holds concentrations, the fit takes their log10)
  const xIsLog = o.xIsLog === true;
  for (const ds of sets) {
    const fit = ds?.fit;
    if (!fit) continue;
    const model = String(fit.model ?? "");
    if (!/^log_(inhibitor|agonist)_vs_response_4pl$/.test(model)) {
      py.push(`# "${ds.name}": ${fit.label ?? model}: no standard Python call is written for this model.`);
      rr.push(`# "${ds.name}": ${fit.label ?? model}: drc::drm with the matching fct, if drc has it.`);
      continue;
    }
    const mid = model.includes("inhibitor") ? "LogIC50" : "LogEC50";
    py.push(`s = d[d["Dataset"] == ${q(String(ds.name))}]`,
      `x = pd.to_numeric(s[${q(xcol)}], errors="coerce").to_numpy(dtype=float)`,
      "y = pd.to_numeric(s[\"Value\"], errors=\"coerce\").to_numpy(dtype=float)",
      "ok = np.isfinite(x) & np.isfinite(y)",
      `logx = ${xIsLog ? "x[ok]" : "np.log10(x[ok])"}; y = y[ok]`,
      `p, cov = curve_fit(four_pl, logx, y, p0=[y.max(), y.min(), np.median(logx), ${mid === "LogIC50" ? "-1.0" : "1.0"}], maxfev=20000)`,
      "se = np.sqrt(np.diag(cov)); tq = stats.t.ppf(0.975, len(y) - 4)",
      `report(SHEET + " | " + ${q(String(ds.name))}, Top=p[0], Bottom=p[1], ${mid}=p[2], HillSlope=p[3],`,
      `       ${mid}_ci=[p[2] - tq * se[2], p[2] + tq * se[2]], ${mid.slice(3)}=10 ** p[2])`);
    rr.push(`s <- d[d$Dataset == ${q(String(ds.name))}, ]`,
      `s$dose <- ${xIsLog ? "10^as.numeric(s[[" + q(xcol) + "]])" : "as.numeric(s[[" + q(xcol) + "]])"}; s$y <- as.numeric(s$Value)`,
      "fit <- drc::drm(y ~ dose, data = s, fct = drc::LL.4(names = c(\"Hill\", \"Bottom\", \"Top\", \"Xmid\")))",
      "print(summary(fit)); print(confint(fit))");
    if (fit.weighting && fit.weighting !== "none") caveats.push(`"${ds.name}" was fitted with weighting (${fit.weighting}); this fit is unweighted.`);
    if (ds.rout) {
      caveats.push(`"${ds.name}": OpenDose removed ${num(ds.rout.n_outliers) ? ds.rout.n_outliers : "the"} outlier(s) by ROUT (Q = ${ds.rout.q}). `
        + "ROUT (Motulsky & Brown 2006) has no standard call in SciPy or R, so this fit uses every value.");
    }
    if (fit.robust || o.robust) caveats.push(`"${ds.name}" was fitted by robust regression in OpenDose; this is an ordinary least-squares fit.`);
  }
  if (!py.length) return none("No data set of this fit has a result to re-run.");
  caveats.push("drc's LL.4 writes the slope as b = −HillSlope and fits on the dose scale; the midpoint and its CI agree.");
  if (sets.some((ds) => ds?.fit?.constraints && Object.keys(ds.fit.constraints).length)) {
    caveats.push("Parameters constrained in OpenDose are fitted freely here; add bounds to curve_fit to match.");
  }
  return { py, r: rr, caveats };
}

function linreg(r: R, t: DataTableModel): Part {
  const xcol = t.xTitle || "X";
  const sets: R[] = (Array.isArray(r.datasets) ? r.datasets : []).filter((d: R) => d?.fit?.slope);
  if (!sets.length) return none("No line was fitted.");
  return {
    py: sets.flatMap((ds) => [`s = d[d["Dataset"] == ${q(String(ds.name))}]`,
      `x = pd.to_numeric(s[${q(xcol)}], errors="coerce"); y = pd.to_numeric(s["Value"], errors="coerce")`,
      "ok = np.isfinite(x) & np.isfinite(y)",
      "res = stats.linregress(x[ok], y[ok])",
      `report(SHEET + " | " + ${q(String(ds.name))}, slope=res.slope, intercept=res.intercept, p=res.pvalue, r_squared=res.rvalue ** 2)`]),
    r: sets.flatMap((ds) => [`s <- d[d$Dataset == ${q(String(ds.name))}, ]`,
      `print(summary(lm(as.numeric(Value) ~ as.numeric(s[[${q(xcol)}]]), data = s)))`]),
    caveats: [],
  };
}

/** A formula term for a multiple-variables column (Q() quotes any name). */
const term = (v: string) => `Q(${q(v)})`;
const rTerm = (v: string) => `\`${v.replace(/`/g, "")}\``;

function regression(r: R, o: R): Part {
  const outcome = String(r.outcome ?? o.outcome ?? "");
  const preds: string[] = Array.isArray(o.predictors) ? o.predictors.map(String)
    : [...new Set((Array.isArray(r.coefficients) ? r.coefficients : []).filter((c: R) => c.name !== "Intercept")
      .map((c: R) => String(c.term ?? c.name).replace(/\[.*\]$/, "")))];
  if ((!outcome && r.analysis !== "cox") || !preds.length) return none("The outcome and predictors of this model are not in its result.");
  const cats = new Set(Object.keys(r.reference_levels ?? {}));
  // categorical predictors carry their reference level first (mv() orders
  // them), so the formula needs no contrast call a column could shadow
  const rhs = preds.map((p) => (cats.has(p) ? `C(${term(p)})` : term(p))).join(" + ");
  const refs = `{${[...cats].map((c) => `${q(c)}: ${q(String(r.reference_levels[c]))}`).join(", ")}}`;
  const rRhs = preds.map(rTerm).join(" + ");
  const prep = [`m = mv(d, [${[outcome, ...(r.totals ? [String(r.totals)] : []), ...(r.exposure ? [String(r.exposure)] : []), ...preds].map(q).join(", ")}], `
    + `categorical=[${[...cats].map(q).join(", ")}], reference=${refs})`];
  const coefOut = "report(SHEET, **{f\"coef {k}\": v for k, v in fit.params.items()}, **{f\"p {k}\": v for k, v in fit.pvalues.items()})";
  const caveats: string[] = [];
  switch (r.analysis) {
    case "multiple_regression":
      return { py: [...prep, "import statsmodels.formula.api as smf",
        `fit = smf.ols(${q(`${term(outcome)} ~ ${rhs}`)}, data=m).fit()`, coefOut],
      r: [`print(summary(lm(${rTerm(outcome)} ~ ${rRhs}, data = d)))`], caveats };
    case "logistic_regression":
      if (r.firth) caveats.push("OpenDose fitted Firth's penalized likelihood; this is the ordinary maximum-likelihood fit (logistf::logistf in R is Firth's).");
      caveats.push("The odds-ratio CIs here are profile likelihood when OpenDose says so; statsmodels' conf_int() is Wald.");
      return { py: [...prep, "import statsmodels.formula.api as smf",
        `fit = smf.logit(${q(`${term(outcome)} ~ ${rhs}`)}, data=m).fit(disp=0)`, coefOut],
      r: [`fit <- glm(${rTerm(outcome)} ~ ${rRhs}, family = binomial, data = d)`, "print(summary(fit)); print(exp(confint(fit)))"], caveats };
    case "poisson_regression":
    case "negative_binomial_regression": {
      const nb = r.analysis === "negative_binomial_regression";
      const quasi = !!r.f_test || r.family === "quasipoisson";
      const off = r.exposure ? `, offset=np.log(m[${q(String(r.exposure))}])` : "";
      const rOff = r.exposure ? ` + offset(log(${rTerm(String(r.exposure))}))` : "";
      const fam = nb ? "" : `family=sm.families.Poisson()${off}`;
      if (nb) {
        caveats.push("statsmodels' NB2 model estimates the dispersion by maximum likelihood, as OpenDose does; the CIs here are Wald.");
        return { py: [...prep, "import statsmodels.formula.api as smf",
          `fit = smf.negativebinomial(${q(`${term(outcome)} ~ ${rhs}`)}, data=m${r.exposure ? `, exposure=m[${q(String(r.exposure))}]` : ""}).fit(disp=0)`,
          coefOut],
        r: [`fit <- MASS::glm.nb(${rTerm(outcome)} ~ ${rRhs}${rOff}, data = d)`, "print(summary(fit))"], caveats };
      }
      if (quasi) caveats.push("Quasi-Poisson: the SEs are scaled by the Pearson dispersion and tested against t, as here.");
      return { py: [...prep, "import statsmodels.api as sm", "import statsmodels.formula.api as smf",
        `fit = smf.glm(${q(`${term(outcome)} ~ ${rhs}`)}, data=m, ${fam}).fit(${quasi ? "scale=\"X2\"" : ""})`,
        coefOut],
      r: [`fit <- glm(${rTerm(outcome)} ~ ${rRhs}${rOff}, family = ${quasi ? "quasipoisson" : "poisson"}, data = d)`,
        "print(summary(fit)); print(exp(confint(fit)))"], caveats };
    }
    case "binomial_regression": {
      const tot = String(r.totals ?? "");
      const quasi = !!r.f_test || r.family === "quasibinomial";
      return { py: [...prep, "import statsmodels.api as sm", "import statsmodels.formula.api as smf",
        `m["positive_share"] = m[${q(outcome)}] / m[${q(tot)}]`,
        "# binomial counts as the share positive, weighted by the number counted",
        `fit = smf.glm(${q(`positive_share ~ ${rhs}`)}, data=m, family=sm.families.Binomial(), var_weights=m[${q(tot)}]).fit(${quasi ? "scale=\"X2\"" : ""})`,
        coefOut],
      r: [`fit <- glm(cbind(${rTerm(outcome)}, ${rTerm(tot)} - ${rTerm(outcome)}) ~ ${rRhs}, family = ${quasi ? "quasibinomial" : "binomial"}, data = d)`,
        "print(summary(fit))"],
      caveats };
    }
    case "cox": {
      const time = String(o.time ?? ""), event = String(o.event ?? "");
      const code = String(o.eventCode ?? "1").trim() || "1";
      const coxPrep = [`m = mv(d, [${[time, event, ...preds].map(q).join(", ")}], categorical=[${[...cats, event].map(q).join(", ")}], `
        + `reference=${refs})`];
      return { py: [...coxPrep, "import statsmodels.formula.api as smf",
        "# Cox regression: statsmodels' PHReg with Efron's ties (OpenDose's default)",
        `status = (m[${q(event)}].str.strip() == ${q(code)}).astype(float).to_numpy()`,
        `fit = smf.phreg(${q(`${term(time)} ~ ${rhs}`)}, data=m, status=status, ties="efron").fit()`,
        "report(SHEET, **{f\"hazard ratio {k}\": np.exp(v) for k, v in zip(fit.model.exog_names, fit.params)},",
        "       **{f\"p {k}\": v for k, v in zip(fit.model.exog_names, fit.pvalues)})"],
      r: ["library(survival)", `print(summary(coxph(Surv(as.numeric(${rTerm(time)}), ${rTerm(event)} == ${q(code)}) ~ ${rRhs}, data = d, ties = "efron")))`],
      caveats: [] };
    }
    default:
      return none("No standard call is written for this model.");
  }
}

const MIXED_DF = "statsmodels' mixedlm fits the same random-intercept model by REML but tests with Wald z: "
  + "it has no containment df, so its P values are smaller than OpenDose's; the estimates agree unless OpenDose "
  + "let a variance component go negative (as Prism can), which mixedlm and lme4 hold at zero.";

/** outcome ~ factors + (1 | grouping) of a multiple-variables table. */
function mixedGrouping(r: R, o: R): Part {
  const outcome = String(r.outcome ?? o.outcome ?? ""), grouping = String(r.grouping ?? o.grouping ?? "");
  const factors: string[] = Array.isArray(r.factor_names) ? r.factor_names.map(String) : [];
  if (!outcome || !grouping || !factors.length) return none("The outcome, factors and grouping column are not in this result.");
  const levels: R = r.levels ?? {};
  const refs = `{${factors.filter((f) => Array.isArray(levels[f])).map((f) => `${q(f)}: ${q(String(levels[f][0]))}`).join(", ")}}`;
  const rhs = factors.map((f) => `C(${term(f)})`).join(" * ");
  return {
    py: [`m = mv(d, [${[outcome, grouping, ...factors].map(q).join(", ")}], categorical=[${[grouping, ...factors].map(q).join(", ")}], reference=${refs})`,
      "import statsmodels.formula.api as smf",
      `fit = smf.mixedlm(${q(`${term(outcome)} ~ ${rhs}`)}, m, groups=m[${q(grouping)}].astype(str)).fit(reml=True)`,
      "report(SHEET, **{f\"coef {k}\": v for k, v in fit.fe_params.items()}, unit_variance=fit.cov_re.iloc[0, 0], residual_variance=fit.scale)"],
    r: [`fit <- lmerTest::lmer(${rTerm(outcome)} ~ ${factors.map(rTerm).join(" * ")} + (1 | ${rTerm(grouping)}), data = d, REML = TRUE)`,
      "print(anova(fit, ddf = \"Satterthwaite\")); print(VarCorr(fit))"],
    caveats: [MIXED_DF],
  };
}

/** Repeated measures with missing values: value ~ treatment + (1 | subject). */
function mixedRm(r: R, t: DataTableModel): Part {
  const k = keyOf(t);
  return {
    py: ["import statsmodels.formula.api as smf",
      "d = d.assign(y=pd.to_numeric(d[\"Value\"], errors=\"coerce\")).dropna(subset=[\"y\"])",
      `d["condition"] = pd.Categorical(d[${q(k)}], categories=[${names(r).map(q).join(", ")}])`,
      "fit = smf.mixedlm(\"y ~ condition\", d, groups=d[\"Replicate\"]).fit(reml=True)",
      "report(SHEET, **{f\"coef {k}\": v for k, v in fit.fe_params.items()})"],
    r: [`d$y <- as.numeric(d$Value); d$condition <- factor(d[[${q(k)}]]); d$subject <- factor(d$Replicate)`,
      "fit <- lmerTest::lmer(y ~ condition + (1 | subject), data = d, REML = TRUE)",
      "print(anova(fit, ddf = \"Satterthwaite\"))"],
    caveats: [MIXED_DF, "OpenDose's headline P here is Geisser-Greenhouse corrected; the mixed model itself assumes compound symmetry."],
  };
}

/** Cox regression of a survival table: the group is the covariate. */
function coxSurvival(r: R): Part {
  const coefs: R[] = Array.isArray(r.coefficients) ? r.coefficients : [];
  if (!coefs.length || coefs.some((c) => c.term !== "Group")) {
    return none("Covariates typed beside a survival table are not in its long CSV; re-run this Cox model from the project.");
  }
  const ref = String(coefs[0].reference ?? "");
  return {
    py: ["import statsmodels.formula.api as smf",
      "d = d.assign(time=pd.to_numeric(d[\"Time\"], errors=\"coerce\"), event=pd.to_numeric(d[\"Event\"], errors=\"coerce\"))",
      "d = d.dropna(subset=[\"time\", \"event\"])",
      `d["Group"] = pd.Categorical(d["Group"], categories=[${q(ref)}] + sorted(set(d["Group"]) - {${q(ref)}}))`,
      `fit = smf.phreg("time ~ C(Group)", data=d, status=d["event"].to_numpy(), ties="efron").fit()`,
      "report(SHEET, **{f\"hazard ratio {k}\": np.exp(v) for k, v in zip(fit.model.exog_names, fit.params)},",
      "       **{f\"p {k}\": v for k, v in zip(fit.model.exog_names, fit.pvalues)})"],
    r: ["library(survival)", "d$time <- as.numeric(d$Time); d$event <- as.numeric(d$Event)",
      `d$Group <- relevel(factor(d$Group), ref = ${q(ref)})`,
      "print(summary(coxph(Surv(time, event) ~ Group, data = d, ties = \"efron\")))"],
    caveats: [],
  };
}

function nested(r: R): Part {
  return {
    py: ["import statsmodels.formula.api as smf",
      "d = d.assign(y=pd.to_numeric(d[\"Value\"], errors=\"coerce\")).dropna(subset=[\"y\"])",
      "fit = smf.mixedlm(\"y ~ Group\", d, groups=d[\"Group\"] + \": \" + d[\"Subgroup\"]).fit(reml=True)",
      "report(SHEET, **{f\"coef {k}\": v for k, v in fit.fe_params.items()})"],
    r: ["d$y <- as.numeric(d$Value); d$unit <- interaction(d$Group, d$Subgroup)",
      "fit <- lmerTest::lmer(y ~ Group + (1 | unit), data = d, REML = TRUE)",
      "print(anova(fit, ddf = \"Kenward-Roger\"))"],
    caveats: [`statsmodels gives Wald z tests; OpenDose's ${r.analysis === "nested_t_test" ? "t" : "F"} uses the containment df `
      + "(subcolumns minus groups), which lmerTest with Kenward-Roger matches for a balanced design."],
  };
}

function columnStats(r: R, t: DataTableModel): Part {
  const sets: R[] = (Array.isArray(r.datasets) ? r.datasets : []).filter((d: R) => d?.one_sample_t);
  if (!sets.length) return none("Descriptive statistics only: no test to re-run (pandas' describe() gives the summary).");
  const k = q(keyOf(t));
  return {
    py: sets.flatMap((ds) => [`v = group(d, ${q(String(ds.name))}, key=${k})`,
      `res = stats.ttest_1samp(v, ${ds.one_sample_t.hypothetical})`,
      `report(SHEET + " | " + ${q(String(ds.name))}, t=res.statistic, df=res.df, p=res.pvalue, mean=v.mean())`]),
    r: sets.map((ds) => `print(t.test(group(d, ${q(String(ds.name))}, key = ${k}), mu = ${ds.one_sample_t.hypothetical}))`),
    caveats: [],
  };
}

function simple(r: R): Part {
  switch (r.analysis) {
    case "mcnemar":
      return { py: ["from statsmodels.stats.contingency_tables import mcnemar",
        "d = d.assign(n=pd.to_numeric(d[\"Count\"], errors=\"coerce\").fillna(0))",
        "m = d.pivot_table(index=\"Row\", columns=\"Outcome\", values=\"n\", aggfunc=\"sum\", sort=False).to_numpy()",
        "res = mcnemar(m, exact=True)", "report(SHEET, p_exact=res.pvalue)"],
      r: ["d$n <- as.numeric(d$Count)", "m <- xtabs(n ~ factor(Row, unique(Row)) + factor(Outcome, unique(Outcome)), data = d)",
        "print(mcnemar.test(m, correct = FALSE)); print(binom.test(m[1, 2], m[1, 2] + m[2, 1]))"], caveats: [] };
    case "kappa":
      return { py: ["from statsmodels.stats.inter_rater import cohens_kappa",
        "d = d.assign(n=pd.to_numeric(d[\"Count\"], errors=\"coerce\").fillna(0))",
        "m = d.pivot_table(index=\"Row\", columns=\"Outcome\", values=\"n\", aggfunc=\"sum\", sort=False).to_numpy()",
        "res = cohens_kappa(m)", "report(SHEET, kappa=res.kappa, ci=[res.kappa_low, res.kappa_upp])"],
      r: ["d$n <- as.numeric(d$Count)", "m <- xtabs(n ~ factor(Row, unique(Row)) + factor(Outcome, unique(Outcome)), data = d)",
        "print(psych::cohen.kappa(m))"], caveats: [] };
    case "bland_altman": {
      const [a, b] = names(r);
      return { py: [`a, b = paired(d, ${q(a)}, ${q(b)}, key="Group")`, "diff = a - b",
        "bias, sd = diff.mean(), diff.std(ddof=1)",
        "report(SHEET, bias=bias, sd=sd, loa=[bias - 1.959964 * sd, bias + 1.959964 * sd])"],
      r: [`w <- paired(d, ${q(a)}, ${q(b)}, key = "Group")`, "print(BlandAltmanLeh::bland.altman.stats(w$a, w$b))"], caveats: [] };
    }
    case "roc": {
      const [a, b] = names(r);
      return { py: [`pos, neg = group(d, ${q(a)}), group(d, ${q(b)})`,
        "u = stats.mannwhitneyu(pos, neg, alternative=\"two-sided\").statistic",
        "report(SHEET, auc=u / (len(pos) * len(neg)))"],
      r: [`print(pROC::roc(controls = group(d, ${q(b)}), cases = group(d, ${q(a)}), ci = TRUE))`],
      caveats: ["The AUC equals the Mann-Whitney U over n1 × n2; its CI here (Hanley-McNeil style SE) differs from pROC's DeLong CI in the last digit."] };
    }
    default:
      return none("No standard call is written for this analysis.");
  }
}

function part(e: ScriptEntry): Part {
  const r = e.result as R | null;
  const o = (e.options && typeof e.options === "object" ? e.options : {}) as R;
  if (!r || typeof r !== "object") return none("This results sheet had no result when the bundle was made.");
  if (r.error) return none(`This analysis failed in OpenDose (${String(r.error)}); nothing to re-run.`);
  if (r.withheld) return none("OpenDose withheld the P value (fewer than two values in a group); nothing to re-run.");
  const t = e.table;
  switch (e.analysisId === "cox" || e.analysisId === "mv_cox" ? "cox" : r.analysis) {
    case "ttest": return ttest(r, t);
    case "ks_test": return ttest({ ...r, test: "kolmogorov_smirnov" }, t);
    case "anova": return oneWay(r, t);
    case "anova_unequal_var": return welchAnova(r, t);
    case "rm_one_way_anova": return rmOneWay(r, t);
    case "friedman": return friedman(r, t);
    case "two_way_anova": return twoWay();
    case "correlation": return correlation(r, t);
    case "contingency": return contingency(r);
    case "survival": return survival(r);
    case "dose_response": return dose(r, t, o);
    case "linear_regression": return linreg(r, t);
    case "multiple_regression":
    case "logistic_regression":
    case "poisson_regression":
    case "negative_binomial_regression":
    case "binomial_regression": return regression(r, o);
    case "cox": {
      if (t.type === "survival") return coxSurvival(r);
      // the model's terms and the reference level of each categorical one
      const terms: R[] = Array.isArray(r.terms) ? r.terms : [];
      const refs = Object.fromEntries(terms.filter((x) => x.kind === "categorical").map((x) => [x.name, x.reference]));
      return regression({ ...r, analysis: "cox", reference_levels: refs },
        { ...o, predictors: terms.length ? terms.map((x) => String(x.name)) : undefined });
    }
    case "nested_t_test":
    case "nested_one_way_anova": return nested(r);
    case "column_statistics": return columnStats(r, t);
    case "mcnemar":
    case "kappa":
    case "bland_altman":
    case "roc": return simple(r);
    case "mixed_grouping": return mixedGrouping(r, o);
    case "mixed_rm_one_way": return mixedRm(r, t);
    case "mixed_nested_two_way":
    case "mixed_timecourse":
    case "mixed_rm_two_way":
      return {
        py: [`# ${r.formula ? `Model: ${r.formula}. ` : ""}statsmodels.formula.api.mixedlm fits the same random-intercept model (REML),`,
          "# but its tests are Wald z tests: it has no containment or Satterthwaite df, so its P values differ from OpenDose's."],
        r: [`# ${r.formula ? `lmerTest::lmer(${String(r.formula).replace(/^value/, "y")}, REML = TRUE)` : "lmerTest::lmer(...)"} `
          + "with anova(fit, ddf = \"Satterthwaite\") is the closest call; the containment df OpenDose uses is not an lmerTest option."],
        caveats: [],
      };
    default:
      return none(`No standard call is written for this analysis (${String(r.analysis ?? e.analysisId)}); its numbers are in its results CSV.`);
  }
}

// ------------------------------------------------------------ the scripts

const PY_HEAD = `import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import curve_fit

HERE = Path(__file__).resolve().parent
RESULTS = {}


def load(name):
    """A data table in long form (one value per row), without the values
    excluded in OpenDose."""
    d = pd.read_csv(HERE / "data" / name, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    return d[d["excluded"] != "TRUE"] if "excluded" in d.columns else d


def group(d, name, key="Group", col="Value"):
    """The numbers of one group (blank and text cells left out)."""
    v = pd.to_numeric(d.loc[d[key] == name, col], errors="coerce")
    return v[np.isfinite(v)].to_numpy(dtype=float)


def wide(d, groups, key="Group", col="Value"):
    """Matched designs: one row per subject (the table's row), complete rows only."""
    w = d.assign(v=pd.to_numeric(d[col], errors="coerce"))
    w = w.pivot_table(index="Replicate", columns=key, values="v", aggfunc="first")
    return w[groups].dropna()


def paired(d, a, b, key="Group", col="Value"):
    w = wide(d, [a, b], key, col)
    return w[a].to_numpy(dtype=float), w[b].to_numpy(dtype=float)


def mv(d, columns, categorical=(), reference=None):
    """A multiple-variables table: numbers where a column holds numbers;
    each categorical column with OpenDose's reference level first."""
    m = d[list(dict.fromkeys(columns))].copy()
    for c in m.columns:
        if c not in categorical:
            m[c] = pd.to_numeric(m[c], errors="coerce")
    m = m.replace("", np.nan).dropna()
    for c, ref in (reference or {}).items():
        m[c] = pd.Categorical(m[c], categories=[ref] + sorted(set(m[c]) - {ref}))
    return m


def four_pl(logx, top, bottom, logxmid, hill):
    """Y = Bottom + (Top - Bottom) / (1 + 10^((LogXmid - X) * HillSlope))."""
    return bottom + (top - bottom) / (1 + 10 ** ((logxmid - logx) * hill))


def plain(v):
    if isinstance(v, dict):
        return {str(k): plain(x) for k, x in v.items()}
    if np.ndim(v):
        return [plain(x) for x in np.asarray(v).tolist()]
    return float(v)


def report(sheet, **values):
    RESULTS[sheet] = plain(values)
    if "--json" not in sys.argv:
        print(f"\\n{sheet}")
        for k, v in RESULTS[sheet].items():
            print(f"  {k}: {v}")
`;

const R_HEAD = `here <- tryCatch(dirname(normalizePath(sys.frame(1)$ofile)), error = function(e) getwd())

# A data table in long form (one value per row), without the values
# excluded in OpenDose.
load_table <- function(name) {
  d <- read.csv(file.path(here, "data", name), colClasses = "character", check.names = FALSE,
                na.strings = character(0), encoding = "UTF-8")
  if ("excluded" %in% names(d)) d <- d[d$excluded != "TRUE", , drop = FALSE]
  d
}

group <- function(d, name, key = "Group", col = "Value") {
  v <- suppressWarnings(as.numeric(d[d[[key]] == name, col]))
  v[is.finite(v)]
}

wide <- function(d, groups, key = "Group", col = "Value") {
  d$v <- suppressWarnings(as.numeric(d[[col]]))
  w <- reshape(d[, c("Replicate", key, "v")], idvar = "Replicate", timevar = key, direction = "wide")
  w <- w[, paste0("v.", groups), drop = FALSE]
  names(w) <- groups
  w[complete.cases(w), , drop = FALSE]
}

paired <- function(d, a, b, key = "Group", col = "Value") {
  w <- wide(d, c(a, b), key, col)
  list(a = w[[a]], b = w[[b]])
}
`;

const banner = (m: ScriptMeta, lang: "py" | "r", one?: string) => [
  ...(one ? [`# “${one}” of “${m.title || "OpenDose project"}”, re-run with the closest standard call, its data in the script.`,
    "# Made with " + m.app + " on " + m.date.slice(0, 10) + ". Where a standard call computes something else",
    "# (a correction, a CI method, a df rule) a \"Caveat:\" comment says so."] : [
    `# analysis.${lang === "py" ? "py" : "R"}: the analyses of “${m.title || "OpenDose project"}”, re-run from this bundle's CSV files`,
    "# with the closest standard call. Made with " + m.app + " on " + m.date.slice(0, 10) + ".",
    "#",
    "# Each section reads one table from data/ (its long CSV, values excluded in OpenDose",
    "# left out) and runs the analysis of one results sheet. OpenDose's own numbers are in",
    "# results/ and statistics.csv; where a standard call computes something else (a",
    "# correction, a CI method, a df rule) a \"Caveat:\" comment says so."]),
  ...(lang === "py"
    ? ["#", `# Run: python ${one ? "this-script.py" : "analysis.py"}   (add --json to print the numbers as JSON)`,
      "# Needs numpy, pandas and SciPy; statsmodels for the regression and mixed models."]
    : ["#", `# Run: Rscript ${one ? "this-script.R" : "analysis.R (from the bundle folder)"}. Packages named with :: are on CRAN.`]),
];

function section(e: ScriptEntry, p: Part, lang: "py" | "r"): string[] {
  const rule = `# ---- “${e.sheet}” (data: “${e.dataName}”)`;
  const cav = p.caveats.map((c) => `# Caveat: ${c}`);
  if (lang === "py") {
    const runs = p.py.some((l) => !l.startsWith("#"));
    return [rule, ...cav, ...(runs ? [`SHEET = ${q(e.sheet)}`, `d = load(${q(e.csv.replace(/^data\//, ""))})`] : []), ...p.py, ""];
  }
  const runs = p.r.some((l) => !l.startsWith("#"));
  return [rule, ...cav, ...(runs ? [`d <- load_table(${q(e.csv.replace(/^data\//, ""))})`] : []), ...p.r, ""];
}

/** A literal of the long table, for a script that carries its data. */
function inlineData(long: { headers: string[]; rows: string[][] }, lang: "py" | "r"): string {
  const cols = long.headers.map((h, j) => [h, long.rows.map((row) => row[j] ?? "")] as const);
  if (lang === "py") {
    return `d = pd.DataFrame({\n${cols.map(([h, v]) => `    ${q(h)}: [${v.map(q).join(", ")}],`).join("\n")}\n})`;
  }
  return `d <- data.frame(\n${cols.map(([h, v]) => `  ${q(h)} = c(${v.map(q).join(", ")})`).join(",\n")},\n  check.names = FALSE, stringsAsFactors = FALSE)`;
}

/**
 * The whole script of one results sheet (the report card's "Copy whole
 * script"): the helpers, then the section, with the table's values in the
 * script itself (`long`: the table in long form, excluded values left out).
 */
export function sheetScript(e: ScriptEntry, lang: "py" | "r", long: { headers: string[]; rows: string[][] },
  meta: ScriptMeta): string {
  const p = part(e);
  const lines = section(e, p, lang).map((l) => (/^d (=|<-) load/.test(l) ? inlineData(long, lang) : l));
  if (lang === "py") {
    return [...banner(meta, "py", e.sheet), PY_HEAD, "", ...lines,
      "if \"--json\" in sys.argv:", "    print(json.dumps(RESULTS, indent=1))", ""].join("\n");
  }
  return [...banner(meta, "r", e.sheet), "", R_HEAD, "", ...lines].join("\n");
}

/** The table in long form without its excluded values (what the long
 *  CSV holds once the script drops the excluded rows). */
export function longValues(t: DataTableModel): { headers: string[]; rows: string[][] } {
  const l = tableToLong(t);
  return { headers: l.headers, rows: l.rows.filter((_, i) => !l.excluded[i]) };
}

/** Does the script re-run this sheet with a call (not only a comment)? */
export function scriptRuns(e: ScriptEntry): boolean {
  return part(e).py.some((l) => !l.startsWith("#"));
}

export function analysisPy(entries: ScriptEntry[], meta: ScriptMeta): string {
  const body = entries.flatMap((e) => section(e, part(e), "py"));
  return [...banner(meta, "py"), PY_HEAD, "", ...body,
    "if \"--json\" in sys.argv:", "    print(json.dumps(RESULTS, indent=1))", ""].join("\n");
}

export function analysisR(entries: ScriptEntry[], meta: ScriptMeta): string {
  const body = entries.flatMap((e) => section(e, part(e), "r"));
  return [...banner(meta, "r"), "", R_HEAD, "", ...body].join("\n");
}

/** Sheets each script re-runs with a call (the rest carry a comment). */
export function scriptCoverage(entries: ScriptEntry[]): { run: string[]; commented: string[] } {
  const run: string[] = [], commented: string[] = [];
  for (const e of entries) (part(e).py.some((l) => !l.startsWith("#")) ? run : commented).push(e.sheet);
  return { run, commented };
}
