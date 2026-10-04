// Per-dataset drivers for validate-site.mjs. Each driver works the live
// page the way a user would (New data table, paste, Analyze, options) and
// returns { quantity: shown string | { s, abs, conv, pct, sig, note } }
// read from the results sheet as rendered. A quantity left out is
// reported as not shown; __why(q) explains why when it is known.
//
// Where the corpus layout cannot be pasted as is (a long file for a
// wide-only analysis, say), the driver rearranges the text the way a
// user would in a spreadsheet and records that as a friction.

export const DRIVERS = new Map();

/** Known reasons a reference cannot match exactly, each backed by an
 *  independent check (README notes of the corpus, or a scipy / statsmodels
 *  refit done while writing this script). A failing quantity matching one
 *  of these is still reported as a failure, with the reason attached. */
export const EXPLAIN = {
  "nist-smls07": [{ re: /./, context: true, why: "stress test: the data (1e12 + 0.x) are not exactly representable in float64; a shifted two-pass computation on the same doubles gives F 21.0008 and a plain two-pass 21.0399, so the certified 21 at rel 1e-6 is out of reach of float64 input" }],
  "nist-smls08": [{ re: /./, context: true, why: "stress test (float64 input): shifted two-pass gives F 201.013, plain two-pass 200.891" }],
  "nist-smls09": [{ re: /./, context: true, why: "stress test (float64 input): shifted two-pass gives F 2001.13, plain two-pass 1999.91" }],
  "r-puromycin": [{ re: /weighted/, why: "method: the page's 1/Y weighting is the IRLS fixed point (independent IRLS: Vmax 207.7835, Km 0.056729); the reference minimises Σ(y − Ŷ)²/Ŷ" }],
  "drc-ryegrass": [{ re: /^se_|ED50_ci/, why: "independent least-squares refit (scipy curve_fit) gives SE(b) 0.31872, SE(d) 0.20799, SE(e) 0.20220, as the page shows; drc's printed SEs differ (its own numerical Hessian)" }],
  "drc-s-alba": [{ re: /^se_|^b_/, why: "independent least-squares refit (scipy) gives b 2.38545 / 5.05836, SE(b) 0.43711 / 1.01637, SE(c) 0.08671, as the page shows; drc stopped short of the optimum (README: printed estimates hold to 3-4 digits)" }],
  "r-toothgrowth": [{ re: /^F\.supp_4dp$/, why: "F(supp) = 15.571979 (direct computation), which rounds to 15.5720 as the page shows; r-statistics.co's 15.5719 is truncated" }],
  "power-r-examples": [{ re: /^r_prop_p2\.p2$/, why: "solving R's own power formula to 1e-14 gives p2 = 0.8026306 (the page's 0.802631); R's power.prop.test stops its root search at tol ≈ 1.2e-4" }],
  "bland-altman-pefr": [{ re: /^loa_/, why: "the paper computes the limits from the bias and SD rounded to 0.1 (−2.1 ± 2 × 38.8); unrounded −2.118 ± 2 × 38.765 gives −79.65 and 75.41 as the page shows" },
    { re: /loa_ci/, why: "the page's approximate CI uses Bland & Altman (1999) SE = s√(1/n + z²/(2(n−1))); the 1986 paper used s√(3/n) (and its rounded limits)" }],
  "gp-book-twosite-ex2": [{ re: /^two\./, why: "README: an independent scipy refit gives Fraction 0.128 and SS 150257 (the page: 0.1281); the book's 0.1271 is not reproduced by any refit" }],
  "gp-book-normalized-2param": [{ re: /se_|residual_ss|sy_x|HillSlope/, why: "README: an independent refit of the printed table gives SE 0.05250 / 0.05232 and SS 1641.5 (the page's values); one printed data value is probably rounded" }],
  "gp-stats-ratio-ttest": [{ re: /mean_log10|ratio_ci_upper/, why: "README: scipy gives the mean log10 difference −0.30429 (the guide prints −0.3042); 10^−0.27454 = 0.5315 (the guide prints 0.531)" }],
};
const def = (ids, fn) => { for (const id of [].concat(ids)) DRIVERS.set(id, fn); };

// ------------------------------------------------------------- utilities
const lines = (csv) => csv.trim().split("\n");
const header = (csv) => lines(csv)[0].split(",");
const body = (csv) => lines(csv).slice(1).map((l) => l.split(","));
const tsv = (rows) => rows.map((r) => r.join("\t")).join("\n");
/** Rows as comma-separated text (quoted where needed): a paste of it opens
 *  the Import dialog, where the titles row and column roles are set. */
const csvText = (rows) => rows.map((r) => r.map((c) => (/[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n");
const LN10 = Math.log(10);
/** Two decimal-safe columns of a CSV as a TSV block for the grid. */
const pick = (csv, cols) => {
  const h = header(csv);
  const ix = cols.map((c) => h.indexOf(c));
  return csvText([cols, ...body(csv).map((r) => ix.map((i) => r[i] ?? ""))]);
};
const MISSING_ANOVA_TABLE = "not shown: one-way ANOVA has no ANOVA table (no MS rows, no residual SD); only F(DFn, DFd), P, R² and SS (treatment / residual) are printed";
const MISSING_ONE_SIDED = "not shown: the t test / nonparametric / correlation / Fisher results offer no one-tailed option, only two-tailed P";

// ------------------------------------------------------------- NIST ANOVA
async function oneWayAnova(u, R, { kruskal = false } = {}) {
  const csv = u.csv();
  await u.newTable("column", u.id, { "Groups (columns)": header(csv).length });
  await u.paste(csv);
  await u.columnAnalysis("anova");
  u.friction("friction", "Switching a results sheet from Column statistics to one-way ANOVA (or t test, etc.) keeps the sheet and tab name \"Column stats\" (e.g. tab \"Column stats 1\", sheet \"Column stats of …\"); the analysis selects (test kind, group pickers, ANOVA type) carry no accessible name.");
  if (kruskal) await u.select("Type", "nonparametric");
  await u.settle(kruskal ? "Kruskal-Wallis" : "one-way ANOVA");
  return u.snap();
}
const readAnova = (R, s) => {
  const f = R.cell(s, /^F \(DFn/);
  const ss = R.cell(s, /^SS \(treatment/);
  return {
    F: R.rx(f, /=\s*([-\d.e+]+)/), df_between: R.rx(f, /F\((\d+)/), df_within: R.rx(f, /,\s*(\d+)\)/),
    p: R.cell(s, /^P value/), ss_between: ss?.split("/")[0], ss_within: ss?.split("/")[1],
    r_squared: R.cell(s, /^R squared/),
  };
};
def(["nist-sirstv", "nist-smls01", "nist-smls02", "nist-smls03", "nist-smls04", "nist-smls05",
  "nist-smls06", "nist-smls07", "nist-smls08", "nist-smls09", "nist-atmwtag"], async (u, R) => {
  const s = await oneWayAnova(u, R);
  return { ...readAnova(R, s), __why: (q) => (/^ms_|residual_sd/.test(q) ? MISSING_ANOVA_TABLE : null) };
});

// --------------------------------------------------------- NIST univariate
def(["nist-pidigits", "nist-lottery", "nist-lew", "nist-mavro", "nist-michelso", "nist-numacc1",
  "nist-numacc2", "nist-numacc3", "nist-numacc4"], async (u, R) => {
  await u.newTable("column", u.id, { "Groups (columns)": 1 });
  await u.paste(u.csv());
  await u.settle("column statistics");
  const s = await u.snap();
  return {
    mean: R.cell(s, /^Mean$/), sd: R.cell(s, /^SD$/), n: R.cell(s, /^n$/),
    __why: (q) => (q === "lag1_autocorrelation" ? "not available: no autocorrelation statistic in column statistics" : null),
  };
});

// ------------------------------------------------- NIST nonlinear (user eq.)
async function nlFit(u, R, start) {
  const opt = u.ref.analysis.options;
  await u.userEquation({ name: u.id, text: opt.user_equation.text, start });
  await u.settle("user-defined equation fit", { quiet: 1500 });
  const s = await u.snap();
  const got = {
    residual_ss: R.cell(s, /^Sum of squares/), sy_x: R.cell(s, /^Sy\.x/), df: R.cell(s, /^Degrees of freedom/),
  };
  for (const p of Object.keys(start)) {
    got[p] = R.hcell(s, new RegExp(`^${p}$`), /Best-fit/);
    got[`se_${p}`] = R.hcell(s, new RegExp(`^${p}$`), /Std\. Error/);
  }
  return { got, s };
}
def(["nist-misra1a", "nist-chwirut2", "nist-thurber", "nist-mgh09", "nist-lanczos3", "nist-boxbod",
  "nist-rat42", "nist-rat43", "nist-eckerle4", "nist-hahn1"], async (u, R) => {
  await u.newTable("xy", u.id, { "Replicates per X": 1 });
  await u.paste(u.csv(), { cell: "X, row 1" });
  const sv = u.ref.analysis.options.start_values;
  const first = await nlFit(u, R, sv.start1);
  const c1 = u.ref.reference.map((r) => R.compare(r, first.got[r.quantity] ?? null));
  const ok1 = c1.filter((c) => c.status === "pass").length;
  const notes = [`Start 1 (${JSON.stringify(sv.start1)}): ${ok1}/${c1.length} references pass`];
  if (/Fit did not converge|did not converge|failed|Ambiguous/i.test(first.s.text.slice(0, 400))) {
    notes.push(`Start 1 banner: ${first.s.text.slice(0, 160).replace(/\s+/g, " ")}`);
  }
  if (ok1 < c1.length) {
    const second = await nlFit(u, R, sv.start2);
    const c2 = u.ref.reference.map((r) => R.compare(r, second.got[r.quantity] ?? null));
    notes.push(`Start 2 (${JSON.stringify(sv.start2)}): ${c2.filter((c) => c.status === "pass").length}/${c2.length} references pass (reported numbers are from Start 1)`);
  }
  return { ...first.got, __notes: notes };
});

// ------------------------------------------------------ NIST linear family
async function xyPaste(u, csv, name, reps = 1, opts = {}) {
  await u.newTable("xy", name ?? u.id, { "Replicates per X": reps, ...(opts.shape ?? {}) });
  return u.paste(csv, { cell: "X, row 1", perDataset: reps > 1 ? reps : undefined, ...opts.paste });
}
const readParams = (R, s, names, map = {}) => {
  const got = {};
  for (const [q, p] of Object.entries(names)) {
    got[q] = R.hcell(s, new RegExp(`^${p}$`), /Best-fit/, map);
    got[`se_${q}`] = R.hcell(s, new RegExp(`^${p}$`), /Std\. Error/, map);
  }
  return got;
};
const fitStats = (R, s, opts) => ({
  residual_ss: R.cell(s, /^Sum of squares/, 1, opts), sy_x: R.cell(s, /^Sy\.x/, 1, opts),
  df: R.cell(s, /^Degrees of freedom/, 1, opts), r_squared: R.cell(s, /^R squared/, 1, opts),
});
const NO_LINREG = "not shown: there is no linear-regression analysis for XY tables (only the straight-line model of the nonlinear fit), so the regression ANOVA (SS/MS regression, F, residual MS) is not printed";

def("nist-norris", async (u, R) => {
  u.friction("missing", "XY tables have no linear-regression analysis (Prism's Simple linear regression: slope, intercept, r², the F test of slope = 0, runs test, X at Y). A straight line is available only as \"Straight line (via nonlinear engine)\" in the curve-fit model list, without the regression ANOVA.");
  await xyPaste(u, u.csv());
  await u.model("straight line", /Straight line/);
  await u.settle("straight line fit");
  const s = await u.snap();
  const names = Object.fromEntries((await u.page.locator(".results-table tbody th").allInnerTexts()).map((t) => [t.trim(), t.trim()]));
  const st = fitStats(R, s);
  const intercept = Object.keys(names).find((n) => /intercept/i.test(n)) ?? "YIntercept";
  const slope = Object.keys(names).find((n) => /slope/i.test(n)) ?? "Slope";
  return {
    B0: R.hcell(s, new RegExp(`^${intercept}$`), /Best-fit/), se_B0: R.hcell(s, new RegExp(`^${intercept}$`), /Std\. Error/),
    B1: R.hcell(s, new RegExp(`^${slope}$`), /Best-fit/), se_B1: R.hcell(s, new RegExp(`^${slope}$`), /Std\. Error/),
    sy_x: st.sy_x, r_squared: st.r_squared, residual_ss: st.residual_ss, df_residual: st.df,
    __why: () => NO_LINREG,
  };
});
def("nist-noint1", async (u, R) => {
  await xyPaste(u, u.csv());
  await u.model("origin", /Line through origin/);
  await u.settle("line through origin");
  const s = await u.snap();
  const st = fitStats(R, s);
  return {
    B1: R.hcell(s, /^Slope$/, /Best-fit/), se_B1: R.hcell(s, /^Slope$/, /Std\. Error/),
    sy_x: st.sy_x, r_squared: { s: st.r_squared, explain: "definition: the page computes R² against a horizontal line through the mean (it is negative here, −0.157); NIST's 0.99937 uses the uncentred total sum of squares for a line through the origin" },
    residual_ss: st.residual_ss, df_residual: st.df, __why: () => NO_LINREG,
  };
});
def("nist-pontius", async (u, R) => {
  await xyPaste(u, u.csv());
  await u.model("second order polynomial", /^Second order polynomial/);
  await u.settle("quadratic");
  const s = await u.snap();
  const p = (await u.page.locator(".results-table tbody th").allInnerTexts()).map((t) => t.trim());
  const st = fitStats(R, s);
  const got = { sy_x: st.sy_x, r_squared: st.r_squared, residual_ss: st.residual_ss, df_residual: st.df };
  ["B0", "B1", "B2"].forEach((b, i) => {
    const name = p[i];
    if (!name) return;
    got[b] = R.hcell(s, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), /Best-fit/);
    got[`se_${b}`] = R.hcell(s, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), /Std\. Error/);
  });
  return { ...got, __why: () => NO_LINREG };
});
def("nist-filip", async (u, R) => {
  u.friction("missing", "Polynomial models stop at sixth order; a tenth-order polynomial (NIST Filip) needs a user-defined equation, which the nonlinear least-squares engine cannot fit reliably at this conditioning.");
  await xyPaste(u, u.csv());
  const text = `Y = B0 + B1*x + B2*x^2 + B3*x^3 + B4*x^4 + B5*x^5 + B6*x^6 + B7*x^7 + B8*x^8 + B9*x^9 + B10*x^10`;
  const start = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`B${i}`, 1]));
  await u.userEquation({ name: "Filip", text, start });
  await u.settle("10th-order polynomial (user equation)", { quiet: 2000 });
  const s = await u.snap();
  const got = fitStats(R, s);
  const out = { sy_x: got.sy_x, r_squared: got.r_squared, residual_ss: got.residual_ss, df_residual: got.df };
  for (let i = 0; i <= 10; i++) {
    out[`B${i}`] = R.hcell(s, new RegExp(`^B${i}$`), /Best-fit/);
    out[`se_B${i}`] = R.hcell(s, new RegExp(`^B${i}$`), /Std\. Error/);
  }
  return { ...out, __why: () => NO_LINREG, __notes: ["user equation, all start values 1"] };
});
def("nist-longley", async (u, R) => {
  await u.newTable("multivariable", u.id);
  await u.paste(u.csv());
  await u.analyze(/Multiple linear regression/);
  await u.settle("multiple regression");
  // outcome = y (the last column); make sure the controls say so
  const s0 = await u.snap();
  if (!/regression of y/i.test(s0.text)) {
    await u.select("Outcome", "y").catch(() => u.select("Dependent", "y"));
    await u.settle("multiple regression (outcome y)");
  }
  const s = await u.snap();
  const got = {};
  for (let i = 0; i <= 6; i++) {
    const lab = i === 0 ? /^β0|Intercept/ : new RegExp(`^β${i}: x${i}$|^x${i}$`);
    const r = R.row(s, lab);
    got[`B${i}`] = r?.[1] ?? null;
    got[`se_B${i}`] = r ? (R.hcell(s, lab, /^SE|Std/) ?? null) : null;
  }
  return {
    ...got, sy_x: R.cell(s, /^Sy\.x|Residual SD|Root mean/), r_squared: R.cell(s, /^R squared/),
    residual_ss: R.cell(s, /^Sum of squares|Residual SS|SS residual/),
    F: R.rx(R.cell(s, /^F$/), /=\s*([-\d.e+]+)/), df_residual: R.rx(R.cell(s, /^F$/), /,\s*(\d+)\)/),
    df_regression: R.rx(R.cell(s, /^F$/), /F \((\d+)/),
    __why: (q) => (/ss_regression|ms_/.test(q) ? "not shown: multiple regression prints F, R² and Sy.x but no regression ANOVA table (SS / MS)" : null),
  };
});

// -------------------------------------------------- R: one-way ANOVA sets
def(["r-plantgrowth", "r-chickwts"], async (u, R) => {
  const s = await oneWayAnova(u, R);
  return { ...readAnova(R, s), __why: (q) => (/^ms_/.test(q) ? MISSING_ANOVA_TABLE : null) };
});
def("r-insectsprays", async (u, R) => {
  const s = await oneWayAnova(u, R);
  const got = readAnova(R, s);
  // Tukey rows "A vs. B": difference = A - B (R prints B - A)
  for (const r of u.ref.reference.filter((x) => x.quantity.startsWith("tukey["))) {
    const [, a, b, what] = r.quantity.match(/tukey\[(\w)-(\w)\]\.(\w+)/);
    const fwd = R.row(s, new RegExp(`^${b} vs\\. ${a}$`)); // page: B vs. A is mean(B)-mean(A)? read sign below
    const rev = R.row(s, new RegExp(`^${a} vs\\. ${b}$`));
    const rr = fwd ?? rev;
    if (!rr) continue;
    // page "X vs. Y" Difference = mean(X) - mean(Y); R's "a-b" = mean(a) - mean(b)
    const flip = !!fwd; // fwd is "b vs. a" -> difference = b - a = -(a - b)
    const ci = rr[2]?.split(" to ");
    if (what === "diff") got[r.quantity] = { s: rr[1], conv: (v) => (flip ? -v : v), note: flip ? "page prints the reverse comparison; sign flipped" : undefined };
    if (what === "lower") got[r.quantity] = ci && { s: flip ? ci[1] : ci[0], conv: (v) => (flip ? -v : v) };
    if (what === "upper") got[r.quantity] = ci && { s: flip ? ci[0] : ci[1], conv: (v) => (flip ? -v : v) };
    if (what === "p_adj") got[r.quantity] = rr[3];
  }
  got.__s = s;
  // Kruskal-Wallis and Bartlett on the same table
  got.bartlett_K2 = R.rx(R.cell(s, /^Bartlett/), /^([-\d.e+]+)/);
  got.bartlett_p = R.rx(R.cell(s, /^Bartlett/), /P\s*=\s*([-\d.e+<]+)/);
  await u.select("Type", "nonparametric");
  await u.settle("Kruskal-Wallis");
  const k = await u.snap();
  got.kruskal_wallis_chi2 = R.cell(k, /^Kruskal-Wallis H/);
  got.kruskal_p = R.cell(k, /^P value/);
  delete got.__s;
  return { ...got, __why: (q) => (/^ms_|residual_sd/.test(q) ? MISSING_ANOVA_TABLE
    : q === "kruskal_df" ? "not shown: Kruskal-Wallis prints H and P but not its df"
      : /fligner/.test(q) ? "not available: Fligner-Killeen test (Brown-Forsythe is printed instead)" : null) };
});
def("r-hw-mucociliary", async (u, R) => {
  const s = await oneWayAnova(u, R, { kruskal: true });
  return { kruskal_wallis_chi2: R.cell(s, /^Kruskal-Wallis H/), p: R.cell(s, /^P value/),
    __why: (q) => (q === "df" ? "not shown: Kruskal-Wallis prints H and P but not its df" : null) };
});
def("r-airquality-ozone", async (u, R) => {
  const s = await oneWayAnova(u, R, { kruskal: true });
  const got = { kruskal_wallis_chi2: R.cell(s, /^Kruskal-Wallis H/), kruskal_p: R.cell(s, /^P value/) };
  // pairwise t tests with the pooled SD, Bonferroni: ordinary ANOVA + Bonferroni
  await u.select("Type", "parametric");
  await u.settle("one-way ANOVA");
  await u.select("Multiple comparisons", "bonferroni");
  await u.settle("Bonferroni comparisons");
  const b = await u.snap();
  for (const r of u.ref.reference.filter((x) => x.quantity.startsWith("pairwise_t_pooled_bonferroni"))) {
    const [, a, c] = r.quantity.match(/\[(\w+)-(\w+)\]/);
    const rr = R.row(b, new RegExp(`^${c} vs\\. ${a}$`)) ?? R.row(b, new RegExp(`^${a} vs\\. ${c}$`));
    if (rr) got[r.quantity] = rr[3];
  }
  return { ...got, __why: (q) => (q === "kruskal_df" ? "not shown: Kruskal-Wallis prints H and P but not its df"
    : /holm/.test(q) ? "not available: Holm's step-down adjustment (only Holm-Šídák) for pairwise comparisons" : null) };
});

// ------------------------------------------------------------- t tests
async function columnTable(u, csv, groups, opts = {}) {
  await u.newTable("column", opts.name ?? u.id, { "Groups (columns)": groups });
  return u.paste(csv, opts.paste ?? {});
}
async function ttest(u, kind, { a, b } = {}) {
  await u.columnAnalysis("ttest");
  await u.select("Welch or not?", kind).catch(() => u.page.locator(".controls section", { hasText: "Test" }).locator("select").first().selectOption(kind));
  if (a !== undefined) await u.select("Group A", String(a));
  if (b !== undefined) await u.select("Group B", String(b));
  await u.settle(`t test (${kind})`);
}
const tdf = (R, s) => {
  const v = R.cell(s, /^t, df/);
  return { t: R.rx(v, /t=([-\d.e+]+)/), df: R.rx(v, /df=([-\d.e+]+)/) };
};
def("r-sleep", async (u, R) => {
  u.friction("friction", "A column table made with the default three groups keeps an empty \"Group C\" after a two-column paste; it is listed in Column statistics with n = 0 and every value n/a, and in every group picker.");
  await columnTable(u, u.csv(), 2, { paste: { roles: { 1: "rowTitle" } } });
  await ttest(u, "paired");
  let s = await u.snap();
  let x = tdf(R, s);
  const ci = R.cell(s, /^95% CI of difference/)?.split(" to ");
  const got = {
    "paired.t": { s: x.t, abs: true }, "paired.df": x.df, "paired.p": R.cell(s, /^P value/),
    "paired.mean_diff": R.cell(s, /^Mean of differences/), "paired.ci_lower": ci?.[0], "paired.ci_upper": ci?.[1],
  };
  if (x.t && Number(x.t) > 0) u.friction("friction", "t tests print t without its sign (t = 4.062 for a mean difference of −1.58): the sign of t disagrees with the difference shown in the same table.");
  await ttest(u, "welch");
  s = await u.snap(); x = tdf(R, s);
  got["welch.F"] = { s: x.t, conv: (v) => v * v, note: "F of oneway.test = t² (page prints t)" };
  got["welch.df_denom"] = x.df; got["welch.p"] = R.cell(s, /^P value/);
  await ttest(u, "unpaired");
  s = await u.snap(); x = tdf(R, s);
  got["pooled.F"] = { s: x.t, conv: (v) => v * v, note: "F = t² (page prints t)" };
  got["pooled.df"] = x.df; got["pooled.p"] = R.cell(s, /^P value/);
  await u.columnAnalysis("anova");
  await u.settle("one-way ANOVA on two groups");
  s = await u.snap();
  const ss = R.cell(s, /^SS \(treatment/);
  got["pooled.ss_between"] = ss?.split("/")[0]; got["pooled.ss_within"] = ss?.split("/")[1];
  // one-sample t test on all 20 values stacked in one column
  const vals = body(u.csv()).flatMap((r) => [r[1], r[2]]);
  await u.newTable("column", "sleep, all 20", { "Groups (columns)": 1 });
  await u.paste(vals.join("\n"));
  await u.columnAnalysis("column_statistics");
  await u.fillIn("Hypothetical value", "0").catch(async () => {
    await u.page.locator(".controls section", { hasText: "Hypothetical value" }).locator("input").first().fill("0");
  });
  await u.settle("one-sample t test");
  s = await u.snap();
  const t1 = R.cell(s, /^One-sample t vs/);
  got["one_sample_all20.t"] = R.rx(t1, /t\s*=\s*([-\d.e+]+)/);
  got["one_sample_all20.df"] = R.rx(t1, /df\s*=\s*(\d+)/);
  got["one_sample_all20.p"] = R.rx(t1, /P\s*=\s*([-\d.e+]+)/);
  const ci1 = R.cell(s, /^95% CI of mean/)?.split(" to ");
  got["one_sample_all20.ci_lower"] = ci1?.[0]; got["one_sample_all20.ci_upper"] = ci1?.[1];
  got["one_sample_all20.mean"] = R.cell(s, /^Mean$/);
  return got;
});
def("r-welch-examples", async (u, R) => {
  await columnTable(u, u.csv(), 3);
  const got = {};
  for (const [key, b] of [["x_vs_y", 1], ["x_vs_y200", 2]]) {
    await ttest(u, "welch", { a: 0, b });
    const s = await u.snap();
    const x = tdf(R, s);
    const ci = R.cell(s, /^95% CI of difference/)?.split(" to ");
    got[`${key}.t`] = { s: x.t, abs: true }; got[`${key}.df`] = x.df; got[`${key}.p`] = R.cell(s, /^P value/);
    got[`${key}.ci_lower`] = ci?.[0]; got[`${key}.ci_upper`] = ci?.[1];
    if (key === "x_vs_y200") got[`${key}.mean_y`] = R.rx(R.cell(s, /^Mean of y_plus_200/), /^([-\d.e+]+)/);
  }
  return got;
});
def("r-mtcars-mpg-by-am", async (u, R) => {
  await columnTable(u, u.csv(), 2);
  await ttest(u, "welch");
  const s = await u.snap();
  const x = tdf(R, s);
  const ci = R.cell(s, /^95% CI of difference/)?.split(" to ");
  return {
    t: { s: x.t, abs: true }, df: x.df, p: R.cell(s, /^P value/), ci_lower: ci?.[0], ci_upper: ci?.[1],
    mean_automatic: R.rx(R.cell(s, /^Mean of automatic/), /^([-\d.e+]+)/),
    mean_manual: R.rx(R.cell(s, /^Mean of manual/), /^([-\d.e+]+)/),
  };
});
def("r-hw-depression", async (u, R) => {
  u.friction("missing", "No one-tailed option anywhere in the t test / Wilcoxon / Mann-Whitney / correlation / Fisher results; one-sided P values have to be halved by hand.");
  await columnTable(u, u.csv(), 2);
  await ttest(u, "wilcoxon");
  const s = await u.snap();
  const pos = R.cell(s, /^Sum of positive, negative ranks/);
  return {
    V: { s: pos?.split(",")[0], note: "R's V = sum of positive ranks (page: 'Sum of positive, negative ranks')" },
    p_two_sided_exact: R.cell(s, /^P value/), __why: (q) => (/one_sided/.test(q) ? MISSING_ONE_SIDED : null),
  };
});
def("r-hw-permeability", async (u, R) => {
  await columnTable(u, u.csv(), 2);
  await ttest(u, "mann_whitney");
  const s = await u.snap();
  const ranks = R.cell(s, /^Sum of ranks/);
  // R's W = rank sum of x minus n(n+1)/2 = U for the first group
  const n1 = body(u.csv()).filter((r) => r[0] !== "").length;
  return {
    W: { s: ranks?.split(",")[0], conv: (v) => v - (n1 * (n1 + 1)) / 2, note: "W = rank sum of the first group − n(n+1)/2 (the page's U is the smaller of the two)" },
    __why: (q) => (/one_sided/.test(q) ? MISSING_ONE_SIDED : null),
  };
});
def("r-friedman-roundingtimes", async (u, R) => {
  await columnTable(u, u.csv(), 3, { paste: { roles: { 1: "rowTitle" } } });
  await u.columnAnalysis("rm_anova");
  await u.select("Type", "nonparametric");
  await u.settle("Friedman");
  const s = await u.snap();
  return { friedman_chi2: R.cell(s, /^Friedman statistic/), p: R.cell(s, /^P value/),
    __why: (q) => (q === "df" ? "not shown: the Friedman result prints no df" : null) };
});
def("r-hw-tuna-correlation", async (u, R) => {
  u.friction("missing", "XY tables have no correlation analysis; correlating two measured variables needs a column table (Correlation, two datasets) or a multiple-variables table.");
  await columnTable(u, u.csv(), 2);
  await u.columnAnalysis("correlation");
  await u.settle("Pearson");
  let s = await u.snap();
  const got = { pearson_r: R.cell(s, /^Pearson r/) };
  await u.select("Method", "spearman");
  await u.settle("Spearman");
  s = await u.snap();
  got.spearman_rho = R.cell(s, /^Spearman r/);
  return { ...got, __why: (q) => (/kendall/.test(q) ? "not available: Kendall's tau"
    : /one_sided/.test(q) ? MISSING_ONE_SIDED : /pearson_t|spearman_S|pearson_df/.test(q) ? "not shown: the correlation result prints r, its CI, R², P and n only" : null) };
});

// ------------------------------------------------------------ two-way ANOVA
/** Two-way ANOVA table row: [source, % of total, SS, DF, MS, F, P]. */
const twoWayRow = (R, s, re) => {
  const r = R.row(s, re, { inT: /Source of variation/ });
  return r ? { pct: r[1], ss: r[2], df: r[3], ms: r[4], F: r[5], p: r[6] } : {};
};
const twoWayRead = (R, s, map) => {
  const got = {};
  for (const [key, re] of Object.entries(map)) {
    const r = twoWayRow(R, s, re);
    for (const k of ["ss", "df", "ms", "F", "p"]) if (r[k] !== undefined) got[`${k}.${key}`] = r[k];
    if (r.pct) got[`percent_variation.${key}`] = { s: r.pct, sig: 3 };
  }
  return got;
};
const NO_ADDITIVE = "not available: the two-way ANOVA has no main-effects-only (no interaction) model";
def("r-warpbreaks", async (u, R) => {
  u.friction("friction", "Two-way ANOVA results call the factors \"Row factor\" and \"Column factor\" even when the table came from a long file with named factor columns (the recipe knows they are tension and wool); names must be typed again under Factor names.");
  await u.recipe(u.csv(), { roles: { wool: "group", tension: "time", breaks: "value" }, output: "grouped" });
  await u.settle("two-way ANOVA");
  const s = await u.snap();
  const got = twoWayRead(R, s, { interaction: /^Interaction/, tension: /^Row factor|^tension/, wool: /^Column factor|^wool/, residual: /^Residual/ });
  return { ...got, __why: (q) => (q.startsWith("additive") ? NO_ADDITIVE : null) };
});
def("r-toothgrowth", async (u, R) => {
  await u.recipe(u.csv(), { roles: { supp: "group", dose: "time", len: "value" }, output: "grouped" });
  await u.settle("two-way ANOVA");
  const s = await u.snap();
  const got = twoWayRead(R, s, { interaction: /^Interaction/, dose: /^Row factor/, supp: /^Column factor/, residual: /^Residual/ });
  for (const k of ["supp", "dose", "interaction", "residual"]) if (got[`ss.${k}`]) got[`ss.${k}_2dp`] = got[`ss.${k}`];
  if (got["F.supp"]) got["F.supp_4dp"] = got["F.supp"];
  if (got["p.interaction"]) got["p.interaction_7dp"] = got["p.interaction"];
  // Tukey on the dose (row) main-effect means
  await u.select("Test", "tukey", { exact: true });
  await u.select("Compare", "row_means", { exact: true });
  await u.settle("Tukey, row means");
  const t = await u.snap();
  const cmp = t.tables.filter((x) => x.head.some((h) => h.includes("Comparison"))).flatMap((x) => x.rows);
  for (const r of u.ref.reference.filter((x) => x.quantity.startsWith("tukey_dose"))) {
    const [, a, b, what] = r.quantity.match(/\[D([\d.]+)-D([\d.]+)\]\.(\w+)/);
    const fwd = cmp.find((x) => x[1] === `${a} vs. ${b}`);
    const rev = cmp.find((x) => x[1] === `${b} vs. ${a}`);
    const rr = rev ?? fwd;
    if (!rr) continue;
    const flip = !!rev; // "b vs. a" = mean(b) − mean(a) = −(a − b)
    const ci = (rr[3] ?? "").split(" to ");
    const conv = (v) => (flip ? -v : v);
    if (what === "diff") got[r.quantity] = { s: rr[2], conv };
    if (what === "lower") got[r.quantity] = { s: flip ? ci[1] : ci[0], conv };
    if (what === "upper") got[r.quantity] = { s: flip ? ci[0] : ci[1], conv };
  }
  return { ...got, __why: (q) => (q.startsWith("tukey_cells") ? "not available: two-way comparisons offer within rows, within datasets and main-effect means, not all cell means against each other" : null) };
});
def("r-morley", async (u, R) => {
  const csv = u.csv();
  const k = header(csv).length - 1;
  await u.newTable("grouped", u.id, { "Datasets (columns)": k, Replicates: 1, "Rows (levels of the row factor)": body(csv).length });
  await u.paste(csv, { roles: { 1: "rowTitle" }, perDataset: 1 });
  await u.settle("two-way ANOVA, one value per cell");
  const t0 = await u.snap();
  if (/Analysis failed/i.test(t0.text)) {
    u.friction("wrong", `Two-way ANOVA on a grouped table with one value per cell (r-morley, 20 runs × 5 experiments) stops with "${(t0.text.match(/Analysis failed[^\n]*/) ?? [""])[0]}" instead of fitting the main-effects-only model, and there is no option to drop the interaction.`);
  }
  const s = await u.snap();
  const got = twoWayRead(R, s, { run: /^Row factor/, expt: /^Column factor/, residual: /^Residual/ });
  return got;
});
def("gp-book-twoway-bonferroni", async (u, R) => {
  await u.newTable("grouped", u.id, { "Datasets (columns)": 2, Replicates: 3, "Rows (levels of the row factor)": 4 });
  await u.paste(u.csv(), { roles: { 1: "rowTitle" }, perDataset: 3 });
  await u.settle("two-way ANOVA");
  const s = await u.snap();
  const got = twoWayRead(R, s, { interaction: /^Interaction/, time: /^Row factor/, treatment: /^Column factor/, residual: /^Residual/ });
  await u.select("Test", "bonferroni", { exact: true });
  await u.select("Compare", "columns_within_rows", { exact: true });
  await u.settle("Bonferroni within rows");
  const t = await u.snap();
  const cmpRows = t.tables.filter((x) => x.head.some((h) => h.includes("Comparison"))).flatMap((x) => x.rows);
  for (let i = 1; i <= 4; i++) {
    const r = cmpRows.find((x) => x[0] === String(i) && / vs\. /.test(x[1] ?? ""));
    if (!r) continue;
    const flip = /^control/i.test(r[1]); // "control vs. treated" = control − treated
    const ci = (r[3] ?? "").split(" to ");
    const conv = (v) => (flip ? -v : v);
    got[`bonferroni[time=${i}].diff_treated_minus_control`] = { s: r[2], conv };
    got[`bonferroni[time=${i}].ci_lower`] = { s: flip ? ci[1] : ci[0], conv };
    got[`bonferroni[time=${i}].ci_upper`] = { s: flip ? ci[0] : ci[1], conv };
  }
  return got;
});

// ------------------------------------------------------------ contingency
async function contingency(u, csv, { analysis } = {}) {
  const h = header(csv);
  await u.newTable("contingency", u.id, { "Outcomes (columns)": h.length - 1, "Groups (rows)": body(csv).length });
  await u.paste(csv, { roles: { 1: "rowTitle" } });
  if (analysis) await u.analyze(analysis);
  await u.settle(analysis ? String(analysis) : "contingency");
  return u.snap();
}
const fisherP = (R, s) => R.rx(R.cell(s, /^Fisher/), /P\s*=\s*([-\d.e+]+|<\s*[\d.]+)/);
const NO_COND_OR = "not available: only the sample odds ratio (with Baptista-Pike / Woolf CIs) is shown, not the conditional MLE odds ratio of R's fisher.test";
def("r-fisher-teatasting", async (u, R) => {
  await contingency(u, u.csv());
  return { __why: (q) => (/one_sided/.test(q) ? MISSING_ONE_SIDED : NO_COND_OR) };
});
def("r-fisher-convictions", async (u, R) => {
  const s = await contingency(u, u.csv());
  return { p_two_sided: fisherP(R, s), __why: (q) => (/one_sided/.test(q) ? MISSING_ONE_SIDED : NO_COND_OR) };
});
def(["r-fisher-job", "r-fisher-mp6"], async (u, R) => {
  const s = await contingency(u, u.csv());
  const p = fisherP(R, s);
  if (!p) u.friction("missing", "Fisher's exact test is computed only for 2×2 tables; r×c tables (Fisher-Freeman-Halton) get the chi-square test only.");
  return { p, __why: () => "not available: no Fisher-Freeman-Halton exact test for r×c tables (chi-square only)" };
});
def("r-chisq-party-gender", async (u, R) => {
  const s = await contingency(u, u.csv());
  const c = R.cell(s, /^Chi-square, df/);
  return { chi2: R.rx(c, /^([-\d.e+]+)/), df: R.rx(c, /,\s*(\d+)\s*,/), p: R.rx(c, /P\s*(?:=\s*)?([<>]?\s*[-\d.e+]+)/),
    __why: (q) => (/expected|residual/.test(q) ? "not shown: expected counts and standardized residuals are not printed" : null) };
});
def("r-chisq-2x2-yates", async (u, R) => {
  const rows = [["", "col1", "col2"], ["r1", "12", "7"], ["r2", "5", "7"]];
  await u.newTable("contingency", u.id, { "Outcomes (columns)": 2, "Groups (rows)": 2 });
  await u.paste(rows.map((r) => r.join(",")).join("\n"), { roles: { 1: "rowTitle" } });
  await u.settle("contingency");
  const s = await u.snap();
  return { p_yates: R.rx(R.cell(s, /^Chi-square with Yates/), /P\s*=\s*([-\d.e+]+)/) };
});
def("r-mcnemar-performance", async (u, R) => {
  const s = await contingency(u, u.csv(), { analysis: /McNemar/ });
  const yates = R.cell(s, /^Chi-square with Yates/);
  return {
    chi2_corrected: R.rx(yates, /^([-\d.e+]+)/), df: R.rx(R.cell(s, /^Chi-square, df/), /,\s*(\d+)\s*,/),
    p: R.rx(yates, /P\s*([<=]\s*[-\d.e+]+)/)?.replace(/^=\s*/, ""),
  };
});
async function cmh(u, csv) {
  const b = body(csv);
  const h = header(csv);
  u.friction("friction", "CMH needs each stratum typed as two adjacent rows with titles \"Stratum: level\"; a long file with a stratum column cannot be pasted or imported into that layout (the recipe has no contingency output), so the titles have to be built by hand.");
  const rows = [["", h[2], h[3]], ...b.map((r) => [`${r[0]}: ${r[1]}`, r[2], r[3]])];
  await u.newTable("contingency", u.id, { "Outcomes (columns)": 2, "Groups (rows)": b.length });
  await u.paste(csvText(rows), { roles: { 1: "rowTitle" } });
  await u.analyze(/Cochran-Mantel-Haenszel/);
  await u.settle("CMH");
  await u.check("Continuity correction in the CMH test", true);
  await u.settle("CMH, continuity correction");
  return u.snap();
}
def("r-cmh-rabbits", async (u, R) => {
  const s = await cmh(u, u.csv());
  const c = R.cell(s, /^Cochran-Mantel-Haenszel chi-square/);
  const or = R.row(s, /^Mantel-Haenszel (common )?odds ratio|^Common odds ratio|odds ratio/i);
  const ci = (or ?? []).join(" ").match(/([-\d.e+]+) to ([-\d.e+]+)/);
  return { mh_chi2_corrected: R.rx(c, /^([-\d.e+]+)/), df: R.rx(c, /,\s*(\d+)/), p: R.cell(s, /^P value/),
    common_odds_ratio_mh: or?.[1] ? R.rx(or[1], /^([-\d.e+]+)/) : null, or_ci_lower: ci?.[1], or_ci_upper: ci?.[2],
    __why: (q) => (/exact/.test(q) ? "not available: exact conditional CMH test / conditional MLE odds ratio" : null) };
});
def("r-cmh-ucbadmissions", async (u, R) => {
  // R's orientation: rows = admitted / rejected, columns = male / female, per department
  const b = body(u.csv());
  const by = {};
  for (const [d, g, a, r] of b) (by[d] ??= {})[g] = [a, r];
  const csv = ["dept,status,Male,Female", ...Object.entries(by).flatMap(([d, x]) => [
    [d, "Admitted", x.Male[0], x.Female[0]].join(","), [d, "Rejected", x.Male[1], x.Female[1]].join(",")])].join("\n");
  const s = await cmh(u, csv);
  const c = R.cell(s, /^Cochran-Mantel-Haenszel chi-square/);
  const or = R.row(s, /odds ratio/i);
  const ci = (or ?? []).join(" ").match(/([-\d.e+]+) to ([-\d.e+]+)/);
  const woolf = R.row(s, /Breslow-Day|homogeneity|Woolf/i);
  return { mh_chi2_corrected: R.rx(c, /^([-\d.e+]+)/), p: R.cell(s, /^P value/),
    common_odds_ratio_mh: or?.[1] ? R.rx(or[1], /^([-\d.e+]+)/) : null, or_ci_lower: ci?.[1], or_ci_upper: ci?.[2],
    woolf_homogeneity_p: /woolf/i.test(woolf?.[0] ?? "") ? R.rx(woolf.join(" "), /P\s*=\s*([-\d.e+]+)/) : null,
    dept_A_odds_ratio: R.cell(s, /^A$/, 2, { inT: /Stratum/ }),
    __why: (q) => (/woolf/.test(q) ? "not available: Woolf's homogeneity test (Breslow-Day is printed if anything)" : /aggregate|dept_A/.test(q) ? "not shown: per-stratum odds ratios / the collapsed table are not printed" : null) };
});
def("r-cmh-satisfaction", async (u) => {
  u.friction("missing", "Cochran-Mantel-Haenszel handles stratified 2×2 tables only; the generalized CMH test for r×c×k tables is not available.");
  return { __why: () => "not available: generalized CMH for r×c×k tables" };
});
def("r-chisq-goodness-of-fit", async (u, R) => {
  const b = body(u.csv());
  const got = {};
  const runGof = async (name, obs, expected) => {
    await u.newTable("partsofwhole", name, { Columns: 1, "Parts (rows)": obs.length });
    await u.paste(csvText([["cat", "observed"], ...obs.map((o, i) => [`c${i + 1}`, o])]), { roles: { 1: "rowTitle" } });
    await u.analyze(/Chi-square goodness of fit/);
    await u.settle("goodness of fit");
    if (expected) {
      await u.page.locator(".controls").getByText("Enter the expected values").click();
      await u.select("Entered as", "fraction");
      for (let i = 0; i < expected.length; i++) {
        await u.page.locator(".controls").getByLabel(`Expected value for c${i + 1}`).fill(expected[i]);
      }
      await u.settle("goodness of fit (expected proportions)");
    }
    const s = await u.snap();
    const c = R.cell(s, /^Chi-square, df/);
    return { chi2: R.rx(c, /χ²\s*=\s*([-\d.e+]+)/) ?? R.rx(c, /^([-\d.e+]+)/), df: R.rx(c, /df\s*=\s*(\d+)/), p: R.cell(s, /^P value/) };
  };
  const a = await runGof("GoF A", b.map((r) => r[1]).filter(Boolean));
  Object.assign(got, { "A_equal.chi2": a.chi2, "A_equal.df": a.df, "A_equal.p": a.p });
  const bb = await runGof("GoF B vs B1", b.map((r) => r[2]), b.map((r) => r[3]));
  Object.assign(got, { "B_vs_B1.chi2": bb.chi2, "B_vs_B1.df": bb.df, "B_vs_B1.p": bb.p });
  const b2 = await runGof("GoF B vs B2", b.map((r) => r[2]), b.map((r) => r[4]));
  Object.assign(got, { "B_vs_B2.chi2": b2.chi2, "B_vs_B2.p": b2.p });
  return got;
});
def("r-binom-mendel", async (u, R) => {
  await u.newTable("contingency", u.id, { "Outcomes (columns)": 2, "Groups (rows)": 1 });
  await u.paste(csvText([["", "giant", "dwarf"], ["peas", "682", "243"]]), { roles: { 1: "rowTitle" } });
  await u.analyze(/One or two proportions/);
  await u.select("Analyze", "one", { exact: true });
  await u.fillIn("Hypothetical proportion", "0.75");
  await u.select("Proportion CI", "clopper_pearson");
  await u.settle("binomial test");
  const s = await u.snap();
  const prop = R.row(s, /^Proportion|^Fraction/);
  const ci = (R.cell(s, /^95% CI/) ?? "").match(/([-\d.e+]+)%? to ([-\d.e+]+)/);
  const bt = R.row(s, /binomial/i);
  return {
    p_two_sided: R.rx(bt?.join(" "), /([-\d.e+]+)\s*\(two-tailed\)/) ?? R.rx(bt?.join(" "), /P\s*=\s*([-\d.e+]+)/),
    proportion: prop?.[1] ? { s: prop[1], pct: /%/.test(prop[1]) } : null,
    ci_lower_clopper_pearson: ci ? { s: ci[1], pct: /%/.test(ci[0]) } : null,
    ci_upper_clopper_pearson: ci ? { s: ci[2], pct: /%/.test(ci[0]) } : null,
  };
});

// ------------------------------------------------------------- survival
async function survivalFromLong(u, csv, roles) {
  await u.recipe(csv, { roles, output: "survival" });
  await u.settle("Kaplan-Meier");
  return u.snap();
}
const kmGroup = (R, s, g) => R.row(s, new RegExp(`^${g}$`), { inT: /Median survival/ });
const NO_KM_TABLE = "not shown: the survival results list n, events, censored and the median per group, but not the Kaplan-Meier table (survival and SE at each event time) nor median CIs";
def("surv-aml", async (u, R) => {
  const s = await survivalFromLong(u, u.csv(), { time_weeks: "value", status: "event", group: "group" });
  u.friction("wrong", "The Kaplan-Meier log-rank (Mantel-Cox) χ² is the approximate Σ(O − E)²/E form: 3.135 for R's aml data where R's survdiff (and the score test of the Cox model on the same site, 3.417) give 3.40; lung by sex 10.23 vs 10.33. P values shift accordingly (0.077 vs 0.065).");
  const lr = R.cell(s, /^Log-rank/);
  const got = {
    "Maintained.median": kmGroup(R, s, "Maintained")?.[4], "Nonmaintained.median": kmGroup(R, s, "Nonmaintained")?.[4],
    logrank_chi2: R.rx(lr, /χ²\s*=\s*([-\d.e+]+)/), logrank_df: R.rx(lr, /df\s*(\d+)/), logrank_p: R.rx(lr, /P\s*=\s*([-\d.e+]+)/),
    "Maintained.observed": kmGroup(R, s, "Maintained")?.[2], "Nonmaintained.observed": kmGroup(R, s, "Nonmaintained")?.[2],
  };
  await u.analyze(/Cox proportional hazards/);
  await u.settle("Cox (Efron)");
  let c = await u.snap();
  let r = R.row(c, /^Group: Nonmaintained/);
  Object.assign(got, { "cox_efron.coef_Nonmaintained": r?.[1], "cox_efron.se_coef": r?.[2], "cox_efron.z": r?.[3],
    "cox_efron.p": r?.[4], "cox_efron.hazard_ratio": r?.[6],
    "cox_efron.lr_chi2": R.rx(R.cell(c, /^Likelihood ratio test/), /χ²\s*=\s*([-\d.e+]+)/) });
  await u.select("Tied event times", /Breslow/.test("Breslow") ? "breslow" : "breslow");
  await u.settle("Cox (Breslow)");
  c = await u.snap();
  r = R.row(c, /^Group: Nonmaintained/);
  Object.assign(got, { "cox_breslow.coef_Nonmaintained": r?.[1], "cox_breslow.se_coef": r?.[2], "cox_breslow.p": r?.[4],
    "cox_breslow.hazard_ratio": r?.[6], "cox_breslow.lr_chi2": R.rx(R.cell(c, /^Likelihood ratio test/), /χ²\s*=\s*([-\d.e+]+)/) });
  return { ...got, __why: (q) => (/survival\[|median_ci/.test(q) ? NO_KM_TABLE : /expected/.test(q) ? "not shown: observed and expected events per group are not printed with the log-rank test" : null) };
});
async function mvCox(u, csv, { time, event, eventCode = "1", keep }) {
  await u.newTable("multivariable", `${u.id} (Cox)`);
  await u.paste(csv);
  await u.analyze(/Cox proportional hazards/);
  await u.select("Time", time, { exact: true });
  await u.select("Event", event, { exact: true });
  await u.fillIn("Event value", eventCode);
  // keep only the wanted covariates (the list changes as boxes are ticked)
  const names = await u.page.locator(".clin-varlist label.check-row > span:first-of-type")
    .evaluateAll((ss) => ss.map((x) => x.textContent.trim()).filter((t) => !/^Treat the numbers/.test(t)));
  for (const name of names) {
    const box = u.page.locator(".clin-varlist label.check-row", { has: u.page.locator(`span:text-is("${name}")`) }).locator("input").first();
    if (!(await box.count()) || await box.isDisabled()) continue;
    const want = keep.includes(name);
    if ((await box.isChecked()) !== want) { u.mark(); await box.click(); }
  }
  await u.settle("Cox regression");
  return u.snap();
}
def("surv-ovarian", async (u, R) => {
  const csv = u.csv();
  const got = {};
  const single = async (cov) => {
    const s = await mvCox(u, csv, { time: "futime_days", event: "fustat", keep: [cov] });
    const r = R.row(s, new RegExp(`^${cov}`));
    return { r, lr: R.rx(R.cell(s, /^Likelihood ratio test/), /χ²\s*=\s*([-\d.e+]+)/) };
  };
  const h = header(csv);
  const covs = { age: "age", resid_ds: "resid_ds", rx: "rx", ecog_ps: "ecog_ps" };
  for (const [k, name] of Object.entries(covs)) {
    if (!h.includes(name)) continue;
    const { r, lr } = await single(name);
    got[`cox_${k}.coef`] = r?.[1]; got[`cox_${k}.se`] = r?.[2];
    if (k === "age") { got["cox_age.p"] = r?.[4]; got["cox_age.hazard_ratio"] = r?.[6]; got["cox_age.lr_chi2"] = lr; }
  }
  const s = await mvCox(u, csv, { time: "futime_days", event: "fustat", keep: ["resid_ds", "rx", "ecog_ps"] });
  for (const k of ["resid_ds", "rx", "ecog_ps"]) {
    const r = R.row(s, new RegExp(`^${k}`));
    got[`cox_multi.${k}.coef`] = r?.[1]; got[`cox_multi.${k}.se`] = r?.[2];
  }
  got["cox_multi.lr_chi2"] = R.rx(R.cell(s, /^Likelihood ratio test/), /χ²\s*=\s*([-\d.e+]+)/);
  return { ...got, __why: (q) => (q.startsWith("overall") ? NO_KM_TABLE : null) };
});
def("surv-lung", async (u, R) => {
  const csv = u.csv();
  const h = header(csv);
  const sexIx = h.indexOf("sex");
  const long = [["time", "event", "sex"].join(","), ...body(csv).map((r) => [r[0], r[2], `sex${r[sexIx]}`].join(","))].join("\n");
  const s = await survivalFromLong(u, long, { time: "value", event: "event", sex: "group" });
  const lr = R.cell(s, /^Log-rank/);
  const got = {
    "n.sex1": kmGroup(R, s, "sex1")?.[1], "n.sex2": kmGroup(R, s, "sex2")?.[1],
    "observed.sex1": kmGroup(R, s, "sex1")?.[2], "observed.sex2": kmGroup(R, s, "sex2")?.[2],
    "median.sex1": kmGroup(R, s, "sex1")?.[4], "median.sex2": kmGroup(R, s, "sex2")?.[4],
    logrank_chi2: R.rx(lr, /χ²\s*=\s*([-\d.e+]+)/), logrank_df: R.rx(lr, /df\s*(\d+)/), logrank_p: R.rx(lr, /P\s*=\s*([-\d.e+]+)/),
  };
  let c = await mvCox(u, csv, { time: "time_days", event: "event", keep: ["sex"] });
  let r = R.row(c, /^sex/);
  const ci = r?.[7]?.split(" to ");
  Object.assign(got, { "cox_sex.coef": r?.[1], "cox_sex.se": r?.[2], "cox_sex.z": r?.[3], "cox_sex.p": r?.[4],
    "cox_sex.hazard_ratio": r?.[6], "cox_sex.hr_ci_lower": ci?.[0], "cox_sex.hr_ci_upper": ci?.[1],
    "cox_sex.lr_chi2": R.rx(R.cell(c, /^Likelihood ratio test/), /χ²\s*=\s*([-\d.e+]+)/),
    "cox_sex.wald_chi2": R.rx(R.cell(c, /^Wald test/), /χ²\s*=\s*([-\d.e+]+)/),
    "cox_sex.score_chi2": R.rx(R.cell(c, /^Score/), /χ²\s*=\s*([-\d.e+]+)/) });
  c = await mvCox(u, csv, { time: "time_days", event: "event", keep: ["age", "sex", "wt_loss"] });
  for (const k of ["age", "sex", "wt_loss"]) {
    r = R.row(c, new RegExp(`^${k}`));
    got[`cox3.${k}.coef`] = r?.[1]; got[`cox3.${k}.se`] = r?.[2];
  }
  Object.assign(got, { "cox3.lr_chi2": R.rx(R.cell(c, /^Likelihood ratio test/), /χ²\s*=\s*([-\d.e+]+)/),
    "cox3.wald_chi2": R.rx(R.cell(c, /^Wald test/), /χ²\s*=\s*([-\d.e+]+)/),
    "cox3.score_chi2": R.rx(R.cell(c, /^Score/), /χ²\s*=\s*([-\d.e+]+)/),
    "cox3.n_used": R.rx(c.text, /(\d+) subjects/), "cox3.events_used": R.rx(c.text, /(\d+) events/) });
  return { ...got, __why: (q) => (/median_ci|survival_1yr|median\.all|ecog/.test(q) ? NO_KM_TABLE + " (or a KM fit stratified by two factors)" : /expected/.test(q) ? "not shown: expected events per group" : null) };
});

// ---------------------------------------------------- multiple variables
def("r-usarrests", async (u, R) => {
  await u.newTable("multivariable", u.id);
  await u.paste(u.csv(), { roles: { 1: "rowTitle" } });
  await u.analyze(/Principal component/);
  await u.settle("PCA");
  const s = await u.snap();
  const got = {};
  for (let i = 1; i <= 4; i++) {
    const r = R.row(s, new RegExp(`^PC${i}$`), { inT: /eigenvalue/i });
    got[`pc${i}.sdev`] = r ? { s: r[1], conv: Math.sqrt, note: "sdev = √eigenvalue" } : null;
    got[`pc${i}.proportion_of_variance`] = r ? { s: r[2], pct: true, sig: 3 } : null;
  }
  for (const v of ["Murder", "Assault", "UrbanPop", "Rape"]) {
    const r = R.row(s, new RegExp(`^${v}$`), { inT: /eigenvectors/i });
    for (let i = 1; i <= 4; i++) got[`loading[${v},PC${i}]`] = r ? { s: r[i], abs: true, note: "eigenvector; sign is arbitrary" } : null;
  }
  // covariance PCA (unstandardized)
  await u.check("Standardize", false);
  await u.settle("PCA, covariance");
  const c = await u.snap();
  const n = body(u.csv()).length;
  for (let i = 1; i <= 4; i++) {
    const r = R.row(c, new RegExp(`^PC${i}$`), { inT: /Eigenvalue/ });
    got[`covariance_pca.pc${i}.sdev_divisor_n`] = r ? { s: r[1], conv: (v) => Math.sqrt(v * (n - 1) / n), note: "√(eigenvalue × (n−1)/n)" } : null;
  }
  return got;
});
def("r-iris", async (u, R) => {
  await u.newTable("multivariable", u.id);
  await u.paste(u.csv());
  await u.analyze(/Principal component/);
  await u.settle("PCA");
  // only the four measurements, unstandardized
  for (const v of ["Species", "species"]) {
    const box = u.page.locator(".controls label", { hasText: new RegExp(`^${v}$`) }).locator("input");
    if (await box.count() && await box.first().isChecked()) await box.first().click();
  }
  await u.check("Standardize", false);
  await u.settle("PCA, covariance");
  const s = await u.snap();
  const got = {};
  for (let i = 1; i <= 2; i++) {
    const r = R.row(s, new RegExp(`^PC${i}$`), { inT: /Eigenvalue/ });
    got[`pc${i}.proportion_of_variance`] = r ? { s: r[2], pct: true, sig: 3 } : null;
  }
  // the % column has 3 significant digits; the eigenvalues give the exact ratio
  const eig = [1, 2, 3, 4].map((i) => Number(R.row(s, new RegExp(`^PC${i}$`), { inT: /Eigenvalue/ })?.[1]));
  if (eig.every(Number.isFinite)) {
    const tot = eig.reduce((a, b) => a + b, 0);
    got["pc1.proportion_of_variance"] = { value: eig[0] / tot, sig: 5, note: `eigenvalue ratio (the % column shows ${got["pc1.proportion_of_variance"]?.s})` };
    got["pc2.proportion_of_variance"] = { value: eig[1] / tot, sig: 5, note: `eigenvalue ratio (the % column shows ${got["pc2.proportion_of_variance"]?.s})` };
  }
  return got;
});
def("r-infert", async (u, R) => {
  await u.newTable("multivariable", u.id);
  await u.paste(u.csv());
  await u.analyze(/Logistic regression/);
  await u.select("Outcome variable", "case");
  const setPreds = async (want) => {
    const boxes = u.page.locator(".mv-varlist label.check-row");
    const n = await boxes.count();
    for (let i = 0; i < n; i++) {
      const name = (await boxes.nth(i).locator("span").first().innerText()).trim();
      const box = boxes.nth(i).locator("input");
      if ((await box.isChecked()) !== want.includes(name)) await box.click();
    }
  };
  const got = {};
  await setPreds(["spontaneous", "induced"]);
  await u.settle("logistic m1");
  let s = await u.snap();
  const coef = (lab) => R.row(s, lab, { inT: /β|Coefficient|Estimate/i }) ?? R.row(s, lab);
  let r = coef(/^β0|Intercept/);
  got["m1.intercept"] = r?.[1]; got["m1.se_intercept"] = r?.[2];
  r = coef(/spontaneous/); got["m1.b_spontaneous"] = r?.[1]; got["m1.se_spontaneous"] = r?.[2];
  r = coef(/induced/); got["m1.b_induced"] = r?.[1]; got["m1.se_induced"] = r?.[2];
  got["m1.z_induced"] = r?.[4]; got["m1.p_induced"] = r?.[5];
  const dev = (snap, k) => {
    const ll = R.cell(snap, /^Log likelihood/);
    return ll ? { s: ll, conv: (v) => -2 * v + 2 * k, note: k ? `AIC = −2 log likelihood + 2×${k} (page prints the log likelihood and AICc only)` : "deviance = −2 log likelihood (page prints the log likelihood)" } : null;
  };
  got["m1.residual_deviance"] = dev(s, 0);
  got["m1.AIC"] = dev(s, 3);
  const g = R.cell(s, /^G \(likelihood ratio\)/);
  got["m1.null_deviance"] = g && got["m1.residual_deviance"] ? { value: Number(g) - 2 * Number(R.cell(s, /^Log likelihood/)), sigShown: 6, note: "G + residual deviance" } : null;
  await setPreds(["age", "parity", "education", "spontaneous", "induced"]);
  await u.settle("logistic m2");
  s = await u.snap();
  for (const [q, lab] of [["intercept", /^β0|Intercept/], ["age", /age/], ["parity", /parity/],
    ["education_6_11", /6-11/], ["education_12plus", /12\+/], ["spontaneous", /spontaneous/], ["induced", /induced/]]) {
    r = coef(lab);
    got[q === "intercept" ? "m2.intercept" : `m2.b_${q}`] = r?.[1];
    got[q === "intercept" ? "m2.se_intercept" : `m2.se_${q}`] = r?.[2];
  }
  got["m2.residual_deviance"] = dev(s, 0);
  got["m2.AIC"] = dev(s, 7);
  got.__why = (q) => (/_df$/.test(q) ? "not shown: the logistic results print n, the parameters and the likelihood-ratio df, not the residual / null deviance df" : null);
  return got;
});

// ------------------------------------------------------ nonlinear fits (R)
/** Every fit on the sheet: { heading, p: { name: { v, se, ci } }, stats }. */
function fits(s) {
  const out = [];
  s.tables.forEach((t, i) => {
    if (!t.head.some((h) => h.includes("Best-fit value"))) return;
    const p = {};
    for (const r of t.rows) p[r[0].replace(/ \(.*\)$/, "").trim()] = { v: r[1]?.replace(/^= /, ""), se: r[2], ci: r[3], raw: r[0] };
    const g = s.tables[i + 1];
    const stat = (re) => g?.rows.find((r) => re.test(r[0]))?.[1] ?? null;
    out.push({ heading: t.heading, p, stats: { df: stat(/^Degrees of freedom/), r2: stat(/^R squared/), ss: stat(/^Sum of squares/), syx: stat(/^Sy\.x/), n: stat(/^# of points/) } });
  });
  return out;
}
const fitOf = (s, nameRe) => fits(s).find((f) => !nameRe || nameRe.test(f.heading)) ?? { p: {}, stats: {} };
const ciPart = (ci, k) => ci?.split(" to ")[k] ?? null;
const NO_COMPARE = "not available: the curve fit has no model comparison (extra-sum-of-squares F test or AICc between two models, or global vs separate fits)";

def("r-puromycin", async (u, R) => {
  u.friction("friction", "Pasting replicate columns (treated_1, treated_2, …) names each data set after its first replicate column (\"treated_1\", \"control_1\") instead of the shared stem.");
  await xyPaste(u, u.csv(), u.id, 2, { shape: { "Y datasets": 2 } });
  await u.model("michaelis", /^Michaelis-Menten$/);
  await u.settle("Michaelis-Menten");
  let s = await u.snap();
  const got = {};
  const all = fits(s);
  for (const [k, f] of [["treated", all[0]], ["untreated", all[1]]]) {
    if (!f) continue;
    Object.assign(got, { [`${k}.Vmax`]: f.p.Vmax?.v, [`${k}.se_Vmax`]: f.p.Vmax?.se, [`${k}.Km`]: f.p.Km?.v,
      [`${k}.se_Km`]: f.p.Km?.se, [`${k}.sy_x`]: f.stats.syx, [`${k}.df`]: f.stats.df });
  }
  await u.advanced();
  u.friction("friction", "Curve fit \"Weight by 1/Y (Poisson-like)\" solves the iteratively reweighted fixed point (weights 1/Ŷ from the curve, held fixed within each iteration): Puromycin treated Vmax 207.78, Km 0.05673, which an independent IRLS reproduces exactly. R's weighted nls (and the corpus reference) minimises Σ(y − Ŷ)²/Ŷ instead (206.83, 0.05461). Neither the option label nor the methods text says which.");
  await u.page.locator(".controls label", { hasText: "Weighting" }).locator("select").selectOption("1/Y");
  u.mark();
  await u.settle("Michaelis-Menten, weight 1/Y");
  s = await u.snap();
  const w = fits(s)[0];
  if (w) {
    Object.assign(got, { "treated_weighted_1_over_Yhat.Vmax": { s: w.p.Vmax?.v, note: "page weights by 1/Y" }, "treated_weighted_1_over_Yhat.Km": w.p.Km?.v,
      "treated_weighted_1_over_Yhat.se_Vmax": w.p.Vmax?.se, "treated_weighted_1_over_Yhat.se_Km": w.p.Km?.se,
      "treated_weighted_1_over_Yhat.sy_x": w.stats.syx });
  }
  return got;
});
def("r-dnase-run1", async (u, R) => {
  await xyPaste(u, u.csv(), u.id, 2);
  await u.model("agonist variable slope four", /^log\(agonist\) vs\. response -- Variable slope/);
  await u.xAlreadyLog(false);
  await u.settle("4PL (fpl)");
  let s = await u.snap();
  const f = fitOf(s);
  const got = {};
  const hill = (p) => Number(p.HillSlope?.v);
  const re = (p, pre) => {
    const H = hill(p);
    got[`${pre}.xmid`] = p.LogEC50 && { s: p.LogEC50.v, conv: (v) => v * LN10, note: "xmid = LogEC50 × ln 10" };
    got[`${pre}.se_xmid`] = p.LogEC50 && { s: p.LogEC50.se, conv: (v) => v * LN10, note: "SE(LogEC50) × ln 10" };
    got[`${pre}.scal`] = p.HillSlope && { s: p.HillSlope.v, conv: (v) => 1 / v, note: "scal = 1 / HillSlope (ln-scale xmid, log10-scale slope)" };
    got[`${pre}.se_scal`] = p.HillSlope && { s: p.HillSlope.se, conv: (v) => v / (H * H), note: "SE(HillSlope) / HillSlope²" };
  };
  re(f.p, "fpl");
  Object.assign(got, { "fpl.A_bottom": f.p.Bottom?.v, "fpl.se_A": f.p.Bottom?.se, "fpl.B_top": f.p.Top?.v, "fpl.se_B": f.p.Top?.se,
    "fpl.sy_x": f.stats.syx, "fpl.df": f.stats.df, "fpl.residual_ss": f.stats.ss });
  await u.constrain("Bottom", 0);
  u.mark();
  await u.settle("3PL, Bottom = 0 (logis)");
  s = await u.snap();
  const g = fitOf(s);
  re(g.p, "logis");
  Object.assign(got, { "logis.Asym": g.p.Top?.v, "logis.se_Asym": g.p.Top?.se, "logis.sy_x": g.stats.syx,
    "logis.df": g.stats.df, "logis.residual_ss": g.stats.ss });
  // Gompertz as a user-defined equation on ln(conc)
  await u.userEquation({ name: "SSgompertz", text: "Y = Asym*exp(-b2*b3^ln(X))", start: { Asym: 3, b2: 2, b3: 0.7 } });
  await u.settle("Gompertz (user equation)");
  s = await u.snap();
  const k = fitOf(s);
  Object.assign(got, { "gompertz.Asym": k.p.Asym?.v, "gompertz.se_Asym": k.p.Asym?.se, "gompertz.b2": k.p.b2?.v,
    "gompertz.se_b2": k.p.b2?.se, "gompertz.b3": k.p.b3?.v, "gompertz.se_b3": k.p.b3?.se,
    "gompertz.sy_x": k.stats.syx, "gompertz.df": k.stats.df });
  return { ...got, __why: (q) => (q.startsWith("logis_vs_fpl") ? NO_COMPARE : null) };
});
def("r-loblolly-329", async (u, R) => {
  u.friction("friction", "A new XY table's automatic first fit is a 4PL with \"X values are already log10(concentration)\" unticked: pasting log-dose X values gives \"not enough data points (0) to fit 4 parameters\" (negative X silently dropped), and pasting non-dose data (time, age, …) starts a long, futile multi-start fit.");
  await xyPaste(u, u.csv());
  await u.model("exponential plateau", /^Exponential plateau/);
  await u.settle("exponential plateau");
  const s = await u.snap();
  const f = fitOf(s);
  const names = Object.keys(f.p);
  const ym = names.find((n) => /^YM|Plateau|Ymax/i.test(n));
  const y0 = names.find((n) => /^Y0/i.test(n));
  const kk = names.find((n) => /^K$|rate/i.test(n));
  const K = Number(f.p[kk]?.v);
  const got = {
    Asym: f.p[ym]?.v, se_Asym: f.p[ym]?.se, resp0: f.p[y0]?.v, se_resp0: f.p[y0]?.se,
    lrc: f.p[kk] && { s: f.p[kk].v, conv: Math.log, note: `lrc = ln(${kk})` },
    se_lrc: f.p[kk] && { s: f.p[kk].se, conv: (v) => v / K, note: `SE(${kk}) / ${kk}` },
    sy_x: f.stats.syx, df: f.stats.df,
  };
  return { ...got, __why: (q) => (q.startsWith("getInitial") ? "not shown: the initial values the fit started from are not displayed" : null) };
});
def("r-indometh-1", async (u, R) => {
  await xyPaste(u, u.csv());
  await u.model("two phase decay", /^Two phase decay$/);
  await u.constrain("Plateau", 0);
  u.mark();
  await u.settle("two-phase decay, Plateau = 0");
  const s = await u.snap();
  const f = fitOf(s);
  const p = f.p;
  const kf = Number(p.KFast?.v);
  const ks = Number(p.KSlow?.v);
  const got = {
    A1: p.SpanFast?.v ?? (p.Y0 && p.PercentFast ? { value: Number(p.Y0.v) * Number(p.PercentFast.v) / 100, sig: 5, note: "A1 = Y0 × PercentFast / 100 (the page does not print SpanFast)" } : null),
    A2: p.SpanSlow?.v ?? (p.Y0 && p.PercentFast ? { value: Number(p.Y0.v) * (1 - Number(p.PercentFast.v) / 100), sig: 4, note: "A2 = Y0 × (1 − PercentFast / 100)" } : null),
    se_A1: p.SpanFast?.se, se_A2: p.SpanSlow?.se,
    lrc1: p.KFast && { s: p.KFast.v, conv: Math.log, note: "lrc1 = ln(KFast)" },
    se_lrc1: p.KFast && { s: p.KFast.se, conv: (v) => v / kf, note: "SE(KFast)/KFast" },
    lrc2: p.KSlow && { s: p.KSlow.v, conv: Math.log, note: "lrc2 = ln(KSlow)" },
    se_lrc2: p.KSlow && { s: p.KSlow.se, conv: (v) => v / ks, note: "SE(KSlow)/KSlow" },
    sy_x: f.stats.syx, df: f.stats.df,
  };
  got.A1_7digits = got.A1; got.lrc1_7digits = got.lrc1; got.A2_7digits = got.A2; got.lrc2_7digits = got.lrc2;
  return { ...got, __notes: [`parameters shown: ${Object.keys(p).join(", ")}`],
    __why: (q) => (/^A[12]|se_A/.test(q) ? "not shown: two-phase decay reports Y0, Plateau, PercentFast, KFast, KSlow (and half-lives) but not SpanFast / SpanSlow (R's A1, A2) with SEs" : null) };
});
def("r-chickweight-chick1", async (u, R) => {
  await xyPaste(u, u.csv());
  await u.model("boltzmann", /^Boltzmann sigmoid/);
  await u.settle("Boltzmann");
  const s = await u.snap();
  const { p, stats } = fitOf(s);
  return { A_bottom: p.Bottom?.v, se_A: p.Bottom?.se, B_top: p.Top?.v, se_B: p.Top?.se, xmid_V50: p.V50?.v, se_xmid: p.V50?.se,
    scal_slope: p.Slope?.v, se_scal: p.Slope?.se, sy_x: stats.syx, df: stats.df,
    __why: (q) => (q.startsWith("getInitial") ? "not shown: the initial values the fit started from are not displayed" : null) };
});
def("growthcurver-a1", async (u, R) => {
  await u.newTable("xy", u.id, { "Replicates per X": 1 });
  await u.paste(u.csv(), { cell: "X, row 1" });
  await u.analyze(/Assay: Growth curves/);
  await u.settle("growth assay");
  await u.select("Subtract", /min/i.test("min") ? await u.page.locator(".controls label", { hasText: "Subtract" }).locator("select option").evaluateAll((os) => (os.find((o) => /min/i.test(o.textContent)) ?? os[0]).value) : "none");
  await u.select("Take the log", await u.page.locator(".controls label", { hasText: "Take the log" }).locator("select option").evaluateAll((os) => (os.find((o) => /^(no|none)/i.test(o.textContent.trim())) ?? os[0]).value));
  await u.select("Growth model", await u.page.locator(".controls label", { hasText: "Growth model" }).locator("select option").evaluateAll((os) => (os.find((o) => /^logistic/i.test(o.textContent.trim())) ?? os[0]).value));
  await u.settle("logistic growth on min-subtracted OD");
  const s = await u.snap();
  const f = fitOf(s);
  const td = R.row(s, /^OD_A1/, { inT: /Doubling time/ });
  return {
    k: f.p.YM?.v, k_se: f.p.YM?.se, r: f.p.K?.v, r_se: f.p.K?.se, n0: f.p.Y0?.v, n0_se: f.p.Y0?.se,
    t_gen: td?.[1], sigma: f.stats.syx, df: f.stats.df,
    __why: (q) => (/auc|t_mid/.test(q) ? "not shown: the growth assay reports the fit and the doubling time, not the inflection time or areas under the curve" : null),
    __notes: ["growth assay: blank = minimum of each curve, no log, logistic model"],
  };
});
def("r-cars", async (u, R) => {
  await xyPaste(u, u.csv());
  const got = {};
  for (const [deg, re] of [[1, /^First order polynomial/], [2, /^Second order polynomial/], [3, /^Third order polynomial/], [4, /^Fourth order polynomial/]]) {
    await u.model(["first", "second", "third", "fourth"][deg - 1] + " order polynomial", re);
    await u.settle(`polynomial degree ${deg}`);
    got[`poly${deg}.residual_ss`] = fitOf(await u.snap()).stats.ss;
  }
  // ln(dist) on ln(speed): Transform both, then a straight line on the linked table
  await u.analyze(/^Transform \(standard/);
  await u.page.getByLabel("Transform X values").selectOption("ln");
  await u.page.getByLabel("Transform Y values").selectOption("ln");
  await u.page.locator(".manip-open").first().click();
  await u.sleep(800);
  await u.analyze(/Nonlinear regression/);
  await u.model("straight line", /Straight line/);
  await u.settle("straight line on ln/ln");
  const s = await u.snap();
  const f = fitOf(s);
  const slope = Object.keys(f.p).find((n) => /slope/i.test(n));
  const icpt = Object.keys(f.p).find((n) => /intercept/i.test(n));
  Object.assign(got, { "loglog.intercept": f.p[icpt]?.v, "loglog.se_intercept": f.p[icpt]?.se, "loglog.slope": f.p[slope]?.v,
    "loglog.se_slope": f.p[slope]?.se, "loglog.sy_x": f.stats.syx, "loglog.df": f.stats.df, "loglog.r_squared": f.stats.r2 });
  return { ...got, __why: (q) => (/poly2_vs_poly1/.test(q) ? NO_COMPARE : /adj_r_squared|loglog\.F|loglog\.p/.test(q) ? NO_LINREG : null) };
});
def("r-anscombe", async (u, R) => {
  u.friction("friction", "An XY table has one X column shared by every data set, so Anscombe's four (x_i, y_i) pairs need four separate XY tables (or a stacked layout); there is no per-data-set X.");
  const csv = u.csv();
  const got = {};
  for (let i = 1; i <= 4; i++) {
    await xyPaste(u, pick(csv, [`x${i}`, `y${i}`]), `Anscombe ${i}`);
    await u.model("straight line", /Straight line/);
    await u.settle(`straight line set ${i}`);
    const f = fitOf(await u.snap());
    const slope = Object.keys(f.p).find((n) => /slope/i.test(n));
    const icpt = Object.keys(f.p).find((n) => /intercept/i.test(n));
    Object.assign(got, { [`set${i}.intercept`]: f.p[icpt]?.v, [`set${i}.se_intercept`]: f.p[icpt]?.se,
      [`set${i}.slope`]: f.p[slope]?.v, [`set${i}.se_slope`]: f.p[slope]?.se, [`set${i}.ss_residual`]: f.stats.ss,
      [`set${i}.df_residual`]: f.stats.df });
  }
  return { ...got, __why: () => NO_LINREG };
});

// ------------------------------------------------------- drc dose-response
def("drc-ryegrass", async (u, R) => {
  await xyPaste(u, u.csv(), u.id, 6);
  await u.model("inhibitor variable slope", /^\[Inhibitor\] vs\. response -- Variable slope/);
  await u.constrain("Bottom", 0);
  u.mark();
  await u.settle("[Inhibitor] vs response, Bottom = 0");
  const s = await u.snap();
  const { p, stats } = fitOf(s);
  const ic = Object.keys(p).find((n) => /^IC50|^EC50/.test(n));
  const ci = p[ic]?.ci;
  return {
    b: p.HillSlope && { s: p.HillSlope.v, abs: true, note: "drc's b and the page's HillSlope have opposite sign conventions" }, se_b: p.HillSlope?.se, d_top: p.Top?.v, se_d: p.Top?.se, e_ED50: p[ic]?.v, se_e: p[ic]?.se,
    residual_se: stats.syx, df: stats.df,
    ED50_ci_lower_delta: ciPart(ci, 0), ED50_ci_upper_delta: ciPart(ci, 1),
    __why: (q) => (/ED5|ED10/.test(q) ? "not available: ECanything (ED5, ED10) is offered only for log(agonist) models, which cannot take the zero-dose control" : /sandwich/.test(q) ? "not available: robust (sandwich) standard errors" : null),
  };
});
def("drc-s-alba", async (u, R) => {
  u.friction("friction", "drc's S.alba file has the two herbicides as blocks of rows (herbicide, dose, replicates); a global fit needs them as two XY data sets side by side, which the Import dialog and the recipes cannot produce from that layout (rearranged by hand here).");
  const b = body(u.csv());
  const doses = [...new Set(b.map((r) => Number(r[1])))].sort((x, y) => x - y);
  const reps = 8;
  const rowFor = (herb, d) => b.find((r) => r[0] === herb && Number(r[1]) === d)?.slice(2, 2 + reps) ?? Array(reps).fill("");
  const rows = [["dose", ...Array(reps).fill("Glyphosate"), ...Array(reps).fill("Bentazone")],
    ...doses.map((d) => [d, ...rowFor("Glyphosate", d), ...rowFor("Bentazone", d)])];
  await u.newTable("xy", u.id, { "Y datasets": 2, "Replicates per X": reps });
  await u.paste(csvText(rows), { cell: "X, row 1", perDataset: reps });
  await u.model("inhibitor variable slope", /^\[Inhibitor\] vs\. response -- Variable slope/);
  await u.share(["Bottom", "Top"]);
  u.mark();
  await u.settle("global 4PL, shared Bottom and Top");
  const s = await u.snap();
  const all = fits(s);
  const g = all.find((f) => /Glyphosate/.test(f.heading)) ?? all[0] ?? { p: {}, stats: {} };
  const bz = all.find((f) => /Bentazone/.test(f.heading)) ?? all[1] ?? { p: {}, stats: {} };
  const ic = (f) => Object.keys(f.p).find((n) => /^IC50|^EC50/.test(n));
  return {
    b_Glyphosate: g.p.HillSlope && { s: g.p.HillSlope.v, abs: true }, se_b_Glyphosate: g.p.HillSlope?.se,
    b_Bentazone: bz.p.HillSlope && { s: bz.p.HillSlope.v, abs: true }, se_b_Bentazone: bz.p.HillSlope?.se,
    c_bottom_shared: g.p.Bottom?.v, se_c: g.p.Bottom?.se, d_top_shared: g.p.Top?.v, se_d: g.p.Top?.se,
    e_ED50_Glyphosate: g.p[ic(g)]?.v, se_e_Glyphosate: g.p[ic(g)]?.se, e_ED50_Bentazone: bz.p[ic(bz)]?.v, se_e_Bentazone: bz.p[ic(bz)]?.se,
    residual_se: g.stats.syx, df: g.stats.df,
    "global.rss": g.stats.ss && bz.stats.ss ? { value: Number(g.stats.ss) + Number(bz.stats.ss), sigShown: 6, note: `sum of the two data sets' Sum of squares (${g.stats.ss} + ${bz.stats.ss}); a global fit prints no total` } : null,
    __why: (q) => (/one_curve|^F$/.test(q) ? NO_COMPARE : /relative_potency|slope_difference/.test(q) ? "not shown: no relative potency or slope comparison for a global nonlinear fit" : null),
    __notes: [`fit headings: ${all.map((f) => f.heading.split(" / ").pop()).join(" | ")}`],
  };
});
async function quantal(u, rows, nSets) {
  await u.newTable("xy", u.id, { "Y datasets": nSets, "Replicates per X": 2 });
  await u.paste(csvText(rows), { cell: "X, row 1", perDataset: 2 });
  await u.analyze(/Quantal dose-response/);
  await u.settle("quantal dose-response");
}
def("drc-earthworms", async (u, R) => {
  const rows = [["dose", "remaining", "total"], ...body(u.csv()).map((r) => [r[0], r[1], r[2]])];
  await quantal(u, rows, 1);
  return { __why: () => "not available: the quantal fit (probit / logit / cloglog with an optional natural response) has no upper limit below 100% (drc's d parameter), so this binomial log-logistic model cannot be reproduced" };
});
def("drc-selenium", async (u, R) => {
  u.friction("friction", "Quantal data in long form (type, dose, dead, total) must be rearranged by hand into dose rows with a responders / N subcolumn pair per group; the recipes take a single value column.");
  const b = body(u.csv());
  const types = [...new Set(b.map((r) => r[0]))];
  const concs = [...new Set(b.map((r) => Number(r[1])))].filter((c) => c > 0).sort((x, y) => x - y);
  u.friction("friction", "Quantal dose-response with a log dose transform refuses the zero-dose control rows (\"a dose of 0 or less cannot be log-transformed. Remove the control row …\"), so the controls have to be deleted by hand; drc's LL.2 uses them (p(0) = 0).");
  const rows = [["conc", ...types.flatMap((t) => [`type ${t}`, `type ${t}`])],
    ...concs.map((c) => [c, ...types.flatMap((t) => { const r = b.find((x) => x[0] === t && Number(x[1]) === c); return r ? [r[3], r[2]] : ["", ""]; })])];
  await quantal(u, rows, types.length);
  await u.select("Link", "logit");
  await u.select("Dose transform", await u.page.locator(".controls label", { hasText: "Dose transform" }).locator("select option").evaluateAll((os) => (os.find((o) => /ln|natural|log/i.test(o.textContent)) ?? os[0]).value));
  await u.select("Natural response", "none");
  await u.select("Heterogeneity correction", "never");
  await u.settle("quantal logit");
  const s = await u.snap();
  const got = {};
  for (const t of types) {
    const r = R.row(s, /^LD50|^ED50/, { inT: new RegExp(`type ${t}`) });
    const ci = (r ?? []).join(" ").match(/([-\d.e+]+) to ([-\d.e+]+)/);
    got[`type${t}.ED50`] = r?.[1];
    got[`type${t}.ED50_ci_lower`] = ci ? { s: ci[1], explain: "method: the page gives Fieller's CI for the ED50 (no delta-method option); drc prints the delta-method (Wald) CI" } : null;
    got[`type${t}.ED50_ci_upper`] = ci ? { s: ci[2], explain: "method: the page gives Fieller's CI for the ED50 (no delta-method option); drc prints the delta-method (Wald) CI" } : null;
  }
  got.__notes = ["control rows (dose 0) removed: the quantal fit cannot log-transform a zero dose"];
  return { ...got, __why: (q) => (/se_ED50/.test(q) ? "not shown: the quantal results give ED50 with a Fieller CI, not its SE" : /loglik|LR/.test(q) ? "not shown: no likelihood-ratio test of a common ED50 (only a parallelism test of slopes)" : null) };
});

// ------------------------------------------------------------- ROC, Deming
def("roc-asah", async (u, R) => {
  u.friction("friction", "ROC on a column table needs one column per marker and outcome (patients, controls); a long file with an outcome column and several markers has to be split by hand (the Unstack option handles one value column at a time).");
  const csv = u.csv();
  const h = header(csv);
  const b = body(csv);
  const ix = (n) => h.indexOf(n);
  const poor = b.filter((r) => r[ix("outcome")] === "Poor");
  const good = b.filter((r) => r[ix("outcome")] === "Good");
  const cols = [];
  for (const m of ["wfns", "s100b", "ndka"]) cols.push([`${m} poor`, ...poor.map((r) => r[ix(m)])], [`${m} good`, ...good.map((r) => r[ix(m)])]);
  const n = Math.max(...cols.map((c) => c.length));
  const rows = Array.from({ length: n }, (_, i) => cols.map((c) => c[i] ?? ""));
  await u.newTable("column", u.id, { "Groups (columns)": 6 });
  await u.paste(csvText(rows));
  await u.analyze(/^ROC curve/);
  await u.settle("ROC");
  const got = {};
  const auc = async (pIx, cIx, name) => {
    await u.select("Patients (condition present)", String(pIx), { exact: true });
    await u.select("Controls (condition absent)", String(cIx), { exact: true });
    await u.settle(`ROC ${name}`);
    let s = await u.snap();
    for (let k = 0; k < 10 && !new RegExp(`ROC curve: ${name}`).test(s.text); k++) { await u.sleep(500); s = await u.snap(); }
    got[`auc.${name}`] = R.rx(R.cell(s, /^Area under the ROC curve/), /^([-\d.e+]+)/);
    const ci = R.cell(s, /^95% CI$/, 1, { inT: /ROC curve/ });
    return { s, ci };
  };
  await auc(0, 1, "wfns");
  await auc(2, 3, "s100b");
  const nd = await auc(4, 5, "ndka");
  const ci = (nd.ci ?? "").match(/([-\d.e+]+) to ([-\d.e+]+)/);
  got["auc_ci_delong.ndka.lower"] = ci?.[1]; got["auc_ci_delong.ndka.upper"] = ci?.[2];
  // partial AUC over specificity 90-100%
  await u.check("Partial area under the curve", true);
  await u.fillIn("From (%)", "90"); await u.fillIn("To (%)", "100");
  await u.settle("partial AUC ndka");
  let s = await u.snap();
  got["pauc_sp90_100.ndka"] = R.rx(R.cell(s, /^Partial (area|AUC)/i), /^([-\d.e+]+)/);
  await u.select("Patients (condition present)", "0", { exact: true });
  await u.select("Controls (condition absent)", "1", { exact: true });
  await u.settle("partial AUC wfns");
  s = await u.snap();
  got["pauc_sp90_100.wfns"] = R.rx(R.cell(s, /^Partial (area|AUC)/i), /^([-\d.e+]+)/);
  await u.check("Partial area under the curve", false);
  // paired DeLong comparisons
  await u.check("Compare two ROC curves (DeLong)", true);
  const cmp = async (p2, c2, key, paired = true) => {
    await u.select("Marker 2 patients", String(p2), { exact: true });
    await u.select("Marker 2 controls", String(c2), { exact: true });
    await u.select("Design", paired ? "paired" : "unpaired", { exact: true });
    await u.settle(`DeLong ${key}`);
    const c = await u.snap();
    return { z: R.cell(c, /^Z$|^Z \(|^z$/), d: R.cell(c, /^D$|^D \(/), p: R.cell(c, /^P value/, 1, { inT: /Comparison/ }) ?? R.cell(c, /^P value/) };
  };
  let c = await cmp(2, 3, "wfns vs s100b");
  got["delong_paired.wfns_vs_s100b.Z"] = c.z; got["delong_paired.wfns_vs_s100b.p"] = c.p;
  c = await cmp(4, 5, "wfns vs ndka");
  got["delong_paired.wfns_vs_ndka.Z"] = c.z; got["delong_paired.wfns_vs_ndka.p"] = c.p;
  c = await cmp(2, 3, "wfns vs s100b, unpaired", false);
  got["delong_unpaired.wfns_vs_s100b.D"] = c.d ?? c.z; got["delong_unpaired.wfns_vs_s100b.p"] = c.p;
  // ndka vs s100b: marker 1 = ndka
  await u.select("Design", "paired", { exact: true });
  await u.select("Patients (condition present)", "4", { exact: true });
  await u.select("Controls (condition absent)", "5", { exact: true });
  c = await cmp(2, 3, "ndka vs s100b");
  got["delong_paired.ndka_vs_s100b.Z"] = c.z; got["delong_paired.ndka_vs_s100b.p"] = c.p;
  return { ...got, __why: (q) => (q.startsWith("paper.") ? "not shown: the page gives the partial AUC as an area, not as a percentage or McClish-standardized percentage of this kind" : null) };
});
def("deming-arsenate", async (u, R) => {
  await xyPaste(u, pick(u.csv(), ["aes", "aas"]));
  await u.analyze(/^Deming regression/);
  await u.settle("Deming");
  let s = await u.snap();
  const got = {
    "unweighted_deming.slope": R.hcell(s, /^Slope$/, /Best-fit|Value|Estimate/) ?? R.cell(s, /^Slope$/),
    "unweighted_deming.intercept": R.hcell(s, /^Y intercept|^Intercept|^YIntercept/, /Best-fit|Value|Estimate/) ?? R.cell(s, /^Y intercept|^Intercept/),
  };
  await u.analyze(/Nonlinear regression/);
  await u.model("straight line", /Straight line/);
  await u.settle("least squares line");
  s = await u.snap();
  const f = fitOf(s);
  const slope = Object.keys(f.p).find((n) => /slope/i.test(n));
  const icpt = Object.keys(f.p).find((n) => /intercept/i.test(n));
  got["ols.slope"] = f.p[slope]?.v; got["ols.intercept"] = f.p[icpt]?.v;
  return { ...got, __why: (q) => (q.startsWith("weighted") ? "not available: Deming regression with a per-point SD for each X and Y (only one error ratio or two SDs for all points)" : null) };
});

// ------------------------------------------------------------- synergy
def("synergy-mathews-block1", async (u, R) => {
  await u.page.getByRole("button", { name: "New data table" }).first().click();
  const dlg = u.page.locator(".new-table-dialog");
  await dlg.getByRole("radio", { name: /Start from an assay/ }).check();
  await dlg.getByText("Drug combination synergy").first().click();
  await dlg.getByText("An empty layout").click();
  await dlg.getByRole("button", { name: "Start assay" }).click();
  await u.sleep(1500);
  const rows = lines(u.csv()).map((l) => l.split(","));
  rows[0][0] = "";
  await u.page.locator("summary", { hasText: "Paste a combination matrix" }).click();
  await u.page.getByLabel("Combination matrix to paste").fill(tsv(rows));
  u.mark();
  await u.page.getByRole("button", { name: "Fill the table" }).click();
  await u.settle("synergy (fill)");
  await u.select("Values are", "viability", { exact: true });
  await u.settle("synergy scores", { quiet: 2000 });
  await u.page.getByLabel("Show matrices").selectOption("all");
  await u.sleep(300);
  const s = await u.snap();
  const got = {};
  const concs2 = rows[0].slice(1).map(Number);
  for (const r of u.ref.reference) {
    const m = r.quantity.match(/^(\w+)_(ref|synergy|fit)\[ispinesib=([\d.]+),ibrutinib=([\d.]+)\]$/);
    if (!m) continue;
    const [, model, kind, c1, c2] = m;
    const titleRe = new RegExp(`${model}.*${kind === "ref" ? "(reference|expected|additive)" : kind === "fit" ? "(fitted|observed fit)" : "(synergy|excess|score)"}`, "i");
    const t = s.tables.find((x) => titleRe.test(x.heading.split(" / ").pop()) || titleRe.test(x.head.flat().join(" ")));
    if (!t) continue;
    const head = t.head.at(-1) ?? [];
    const ci = head.findIndex((h, i) => i > 0 && Math.abs(Number(h) - Number(c2)) < 1e-3 * Math.max(1, Number(c2)));
    const rr = t.rows.find((x) => Math.abs(Number(x[0]) - Number(c1)) < 1e-3 * Math.max(1, Number(c1)));
    if (ci > 0 && rr) got[r.quantity] = { s: rr[ci], sig: 3 };
  }
  got.__notes = [`matrix titles: ${s.tables.map((t) => t.heading.split(" / ").pop()).filter(Boolean).slice(0, 12).join(" | ")}`];
  void concs2;
  if (/very strong antagonism/.test(s.text) && /likely synergistic/.test(s.text)
    && !(await u.page.locator(".qc-chip", { hasText: "Monotherapy fit poor" }).count())) {
    u.friction("friction", "Synergy results contradict themselves without a clear flag: the four synergy scores read \"likely synergistic\" while the Chou-Talalay table below labels every dose pair \"very strong antagonism\" with combination indices up to 1e+28, because a monotherapy median-effect fit failed (r = −0.55); the warning is a sentence under the fits, and the CIs are still printed.");
  }
  return { ...got, __why: (q) => (/ic50|ri_|css/.test(q) ? "not shown: SynergyFinder's monotherapy IC50 / RI / CSS sensitivity scores are not reported"
    : /_ref\[|_fit\[/.test(q) ? "not found: the expected (reference) or ZIP-fitted response matrix (Show: Every matrix)" : null) };
});

// --------------------------------------------------------------- power
async function powerTool(u) {
  await u.page.getByRole("button", { name: "Tools" }).click();
  await u.page.getByRole("menuitem", { name: /Power and sample size/ }).click();
  const pw = u.page.locator("dialog.power-dialog");
  await pw.waitFor();
  return pw;
}
async function powerRun(u, pw, f) {
  await pw.getByLabel("Test", { exact: true }).selectOption(f.kind);
  await pw.getByLabel("Solve for").selectOption(f.solve);
  await pw.getByLabel("α (significance level)").fill(String(f.alpha ?? 0.05));
  if (f.tails) await pw.getByLabel("Tails").selectOption(String(f.tails));
  if (f.solve !== "power" && f.power !== undefined) await pw.getByLabel("Power (1 − β)").fill(String(f.power));
  for (const [lab, v] of Object.entries(f.fields ?? {})) await pw.getByLabel(lab, { exact: true }).fill(String(v));
  for (const [lab, v] of Object.entries(f.selects ?? {})) await pw.getByLabel(lab, { exact: true }).selectOption(String(v));
  u.mark();
  await u.settle(`power: ${f.kind} solve ${f.solve}`, { sel: "dialog.power-dialog .power-output", quiet: 900 });
  const text = await pw.locator(".power-output").innerText();
  const line = (re) => text.split("\n").find((l) => re.test(l))?.split("\t").slice(1).join("\t") ?? null;
  return { text, line };
}
def("power-r-examples", async (u, R) => {
  const pw = await powerTool(u);
  const got = {};
  const t2 = (o) => ({ kind: "t_two_sample", ...o });
  let r = await powerRun(u, pw, t2({ solve: "power", tails: 2, fields: { "n per group (group 1)": 20, "Allocation ratio n2 / n1": 1, "Cohen's d": 1 } }));
  got["r_t_power.power"] = { s: r.line(/^Power achieved/), pct: true, sig: 4 };
  r = await powerRun(u, pw, t2({ solve: "n", tails: 2, power: 0.9, fields: { "Cohen's d": 1 } }));
  got["r_t_n.n_per_group"] = r.line(/^Unrounded n/);
  r = await powerRun(u, pw, t2({ solve: "n", tails: 1, power: 0.9, fields: { "Cohen's d": 1 } }));
  got["r_t_n_onesided.n_per_group"] = r.line(/^Unrounded n/);
  const pr = (o) => ({ kind: "two_proportions", tails: 2, selects: { Method: "z" }, ...o });
  r = await powerRun(u, pw, pr({ solve: "power", fields: { "n per group (group 1)": 50, "Allocation ratio n2 / n1": 1, "Proportion 1 (control)": 0.5, "Proportion 2": 0.75 } }));
  got["r_prop_power.power"] = { s: r.line(/^Power achieved/), pct: true, sig: 4 };
  r = await powerRun(u, pw, pr({ solve: "n", power: 0.9, fields: { "Proportion 1 (control)": 0.5, "Proportion 2": 0.75 } }));
  got["r_prop_n.n_per_group"] = r.line(/^Unrounded n/);
  r = await powerRun(u, pw, pr({ solve: "effect", power: 0.9, fields: { "n per group (group 1)": 50, "Proportion 1 (control)": 0.5 } }));
  got["r_prop_p2.p2"] = R.rx(r.line(/^Effect size/), /=\s*([-\d.e+]+)/);
  r = await powerRun(u, pw, pr({ solve: "n", power: 0.8, fields: { "Proportion 1 (control)": 0.9, "Proportion 2": 1 } }));
  got["r_prop_n_p2_1.n_per_group"] = r.line(/^Unrounded n/);
  const an = (o) => ({ kind: "anova_oneway", ...o });
  r = await powerRun(u, pw, an({ solve: "power", fields: { "Groups (k)": 4, "n per group": 5, "Cohen's f": 0.5 } }));
  got["r_anova_power.power"] = { s: r.line(/^Power achieved/), pct: true, sig: 4, note: "f = √(between_var·(k−1)/k / within_var) = 0.5" };
  r = await powerRun(u, pw, an({ solve: "n", power: 0.8, fields: { "Groups (k)": 4, "Cohen's f": 0.5 } }));
  got["r_anova_n.n_per_group"] = r.line(/^Unrounded n per group/);
  r = await powerRun(u, pw, an({ solve: "n", power: 0.9, fields: { "Groups (k)": 4, "Cohen's f": Math.sqrt(125 / 500) } }));
  got["r_anova_n_means.n_per_group"] = { s: r.line(/^Unrounded n per group/), note: "f from means 120-150 and within variance 500 = 0.5" };
  await pw.getByRole("button", { name: "Done" }).click();
  return got;
});
def("power-gpower-examples", async (u, R) => {
  const pw = await powerTool(u);
  const got = {};
  let r = await powerRun(u, pw, { kind: "correlation", solve: "n", tails: 2, power: 0.95, fields: { "ρ0 (null hypothesis)": 0.6, ρ: 0.65 }, selects: { Method: "exact" } });
  got["gp_corr_rho0.n_total"] = R.rx(r.line(/^Pairs of values|^Total|^n per/), /(\d+)/);
  got["gp_corr_rho0.actual_power"] = { s: r.line(/^Power achieved/), pct: true, sig: 4 };
  const cr = r.line(/^Critical r/)?.split(",");
  got["gp_corr_rho0.critical_r_lower"] = cr?.[0]; got["gp_corr_rho0.critical_r_upper"] = cr?.[1];
  r = await powerRun(u, pw, { kind: "anova_oneway", solve: "n", power: 0.95, fields: { "Groups (k)": 10, "Cohen's f": 0.25 } });
  got["gp_anova_f.n_total"] = R.rx(r.line(/^Total/), /(\d+)/) ?? R.rx(r.line(/^n per group/), /(\d+)\s*×\s*(\d+)/) ;
  got["gp_anova_f.lambda"] = r.line(/^Noncentrality/); got["gp_anova_f.critical_F"] = r.line(/^Critical F/);
  got["gp_anova_f.actual_power"] = { s: r.line(/^Power achieved/), pct: true, sig: 4 };
  r = await powerRun(u, pw, { kind: "correlation", solve: "n", tails: 1, power: 0.95, fields: { "ρ0 (null hypothesis)": 0, ρ: 0.25 }, selects: { Method: "exact" } });
  const pbN = R.rx(r.line(/^Pairs of values|^Total/), /(\d+)/);
  got.__pb = `point-biserial substitute (correlation vs ρ0 = 0, exact): N = ${pbN}, power ${r.line(/^Power achieved/)}`;
  r = await powerRun(u, pw, { kind: "t_paired", solve: "power", tails: 2, fields: { Pairs: 50, "d_z (mean difference ÷ SD of differences)": 0.421637 } });
  got["gp_matched_pairs.power"] = { s: r.line(/^Power achieved/), pct: true, sig: 4 };
  got["gp_matched_pairs.delta"] = r.line(/^Noncentrality/); got["gp_matched_pairs.critical_t"] = r.line(/^Critical t/);
  r = await powerRun(u, pw, { kind: "t_one_sample", solve: "n", tails: 1, power: 0.95, fields: { "Cohen's d": 0.625 } });
  got["gp_one_sample_a.n_total"] = R.rx(r.line(/^Subjects|^Total|^n/), /(\d+)/);
  got["gp_one_sample_a.actual_power"] = { s: r.line(/^Power achieved/), pct: true, sig: 4 };
  got["gp_one_sample_a.delta"] = r.line(/^Noncentrality/);
  r = await powerRun(u, pw, { kind: "t_one_sample", solve: "n", tails: 2, alpha: 0.01, power: 0.9, fields: { "Cohen's d": 0.1 } });
  got["gp_one_sample_b.n_total"] = R.rx(r.line(/^Subjects|^Total|^n/), /(\d+)/);
  got["gp_one_sample_b.actual_power"] = { s: r.line(/^Power achieved/), pct: true, sig: 4 };
  r = await powerRun(u, pw, { kind: "t_two_sample", solve: "n", tails: 1, power: 0.95, fields: { "Cohen's d": 0.5, "Allocation ratio n2 / n1": 1 } });
  got["faul2007_two_sample.n_total"] = r.line(/^Total/); got["faul2007_two_sample.n_per_group"] = R.rx(r.line(/^n per group/), /(\d+)/);
  await pw.getByRole("button", { name: "Done" }).click();
  const pb = got.__pb; delete got.__pb;
  return { ...got, __notes: [pb], __why: (q) => (q.startsWith("gp_point") ? `not available: no point-biserial (t-test based) model; ${pb}` : null) };
});
def("power-prism4-receptors", async (u, R) => {
  const b = body(u.csv());
  const [n1, n2] = [Number(b[0][1]), Number(b[1][1])];
  const [s1, s2] = [Number(b[0][3]), Number(b[1][3])];
  const sp = Math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2));
  const pw = await powerTool(u);
  const got = {};
  for (const [q, pow] of [["difference_for_50pct_power", 0.5], ["difference_for_90pct_power", 0.9]]) {
    const r = await powerRun(u, pw, { kind: "t_two_sample", solve: "effect", tails: 2, power: pow, fields: { "n per group (group 1)": n1, "Allocation ratio n2 / n1": n2 / n1 } });
    const d = R.rx(r.line(/^Effect size/), /=\s*([-\d.e+]+)/);
    if (!d && /NaN|cannot continue/.test(r.text)) {
      u.friction("wrong", "Power tool, two independent groups, Solve for \"Detectable effect\": for many inputs the result is replaced by an error like \"The function value at x=6.99 is NaN; solver cannot continue.\" (reproduced: power 0.9 with n = 20 per group; power 0.7 with n = 20; power 0.8 with n = 18 or 10; power 0.95 with n = 50), while power 0.5, 0.6 and 0.8 with n = 20 work.", `power ${pow}, n ${n1} and ${n2}`);
      got[q] = { note: `page error: ${r.text.split("\n")[0].slice(0, 120)}` };
      continue;
    }
    got[q] = d ? { s: d, conv: (v) => v * sp, note: `detectable d × pooled SD ${sp.toFixed(2)} (the tool works in d; the difference is d × SD)` } : null;
  }
  await pw.getByRole("button", { name: "Done" }).click();
  u.friction("friction", "The power tool solves for a detectable effect only as Cohen's d; with group SDs and n in hand (StatMate's question), the user must pool the SD and multiply by d by hand.");
  return got;
});

// ------------------------------------------------------- private examples
def("bland-altman-pefr", async (u, R) => {
  await u.newTable("column", u.id, { "Groups (columns)": 4 });
  await u.paste(u.csv(), { roles: { 1: "rowTitle" } });
  await u.analyze(/^Bland-Altman/);
  await u.select("Method A", "0", { exact: true });
  await u.select("Method B", "2", { exact: true });
  await u.fillIn("Agreement (%)", "95.45");
  await u.select("CIs of the limits", "approximate", { exact: true });
  await u.settle("Bland-Altman, bias ± 2 SD");
  const s = await u.snap();
  const bias = R.row(s, /^Bias/);
  const sd = R.row(s, /^SD of (the )?differences/);
  const loa = R.cell(s, /limits of agreement/i);
  const lci = R.cell(s, /CI of the lower limit/);
  const uci = R.cell(s, /CI of the upper limit/);
  const bci = R.cell(s, /CI of the bias|95% CI of bias/);
  const two = (x) => (x ?? "").match(/([-\d.e+]+) to ([-\d.e+]+)/);
  return {
    bias: bias?.[1] ? R.rx(bias[1], /^([-\d.e+]+)/) : null, sd_of_differences: sd?.[1],
    loa_lower_2sd: two(loa)?.[1], loa_upper_2sd: two(loa)?.[2],
    bias_ci_lower: two(bci ?? bias?.join(" "))?.[1], bias_ci_upper: two(bci ?? bias?.join(" "))?.[2],
    lower_loa_ci_lower: two(lci)?.[1], lower_loa_ci_upper: two(lci)?.[2], upper_loa_ci_lower: two(uci)?.[1], upper_loa_ci_upper: two(uci)?.[2],
    __why: (q) => (/repeatability/.test(q) ? "not available: repeatability coefficients from duplicate readings" : /se_/.test(q) ? "not shown: standard errors of the bias and limits are not printed (their CIs are)" : null),
    __notes: ["agreement set to 95.45% (bias ± 2 SD as in the paper)"],
  };
});
def("qpcr-livak-table1", async (u, R) => {
  await u.page.getByRole("button", { name: "New data table" }).first().click();
  const dlg = u.page.locator(".new-table-dialog");
  await dlg.getByRole("radio", { name: /Start from an assay/ }).check();
  await dlg.getByText("qPCR (ΔCq / ΔΔCq)").first().click();
  await dlg.getByText("An empty layout").click();
  await dlg.getByRole("button", { name: "Start assay" }).click();
  await u.sleep(1500);
  const wz = u.page.locator("dialog.assay-wizard");
  if (!(await wz.count())) {
    u.friction("friction", "The assay setup wizard did not always open after \"Start assay\"; when it did not, the user has to find \"Open setup wizard…\" in the analysis controls.");
    await u.page.getByRole("button", { name: "Open setup wizard…" }).click();
  }
  await wz.getByLabel("Paste Cq export").waitFor();
  await wz.getByLabel("Paste Cq export").fill(u.csv());
  await wz.getByRole("button", { name: "Read pasted export" }).click();
  const st = await wz.locator("[role=status]").first().innerText();
  const useCols = wz.getByRole("button", { name: "Use these columns" });
  if (await useCols.count()) await useCols.click();   // mapping step: tissue → Sample prefilled
  if (/No Cq table found/.test(st)) {
    u.friction("friction", `qPCR wizard: a Cq export whose sample column is not literally called "Sample" is refused ("${st.slice(0, 110)}"); the column pickers below list the table's own fields, so the header must be renamed in the text first (tissue → Sample here).`);
    await wz.getByLabel("Paste Cq export").fill(u.csv().replace(/^tissue,replicate,target,Ct/, "Sample,Well,Target,Cq"));
    await wz.getByRole("button", { name: "Read pasted export" }).click();
  }
  for (let i = 0; i < 4; i++) {
    const txt = await wz.innerText();
    if (/Reference gene/.test(txt)) {
      const g = wz.locator("label", { hasText: /^GAPDH$/ }).locator("input");
      if (await g.count() && !(await g.isChecked())) await g.click();
      const cal = wz.getByLabel("Calibrator group");
      if (await cal.count()) await cal.selectOption("Brain");
    }
    const next = wz.getByRole("button", { name: /^(Next|Create the ΔCq table)/ });
    u.mark();
    await next.last().click();
    await u.sleep(500);
    if (!(await wz.count())) break;
  }
  await u.settle("qPCR ΔΔCq");
  const s = await u.snap();
  const got = {};
  for (const t of ["Brain", "Kidney"]) {
    const r = R.row(s, new RegExp(`^${t}`), { inT: /Mean ΔCq/ });
    if (r) { got[`${t}.dCt`] = r[2]; got[`${t}.ddCt`] = r[4]; got[`${t}.fold`] = r[5]; }
    const ps = R.row(s, new RegExp(`^${t}$`), { inT: /Mean Cq/ });
    if (ps) got[`${t}.mean_Ct_cmyc`] = ps[3];
  }
  return { ...got, __why: (q) => (/sd_/.test(q) ? "not shown: with one biological sample per tissue the SDs are blank (the page does not propagate technical-replicate SDs as Livak does)"
    : /range/.test(q) ? "not shown: Livak's 2^−(ΔΔCq ± s) range (the page gives a CI from biological replicates)" : /GAPDH/.test(q) ? "not shown: reference-gene Cq means are not listed (the per-sample table shows target rows only)" : null) };
});
async function bookFit(u, model, re, { reps = 1, xLog = true, constrain = {}, sets = 1 } = {}) {
  const csv = u.csv();
  await u.newTable("xy", u.id, { "Y datasets": sets, "Replicates per X": reps });
  await u.paste(csv, { cell: "X, row 1", perDataset: reps > 1 ? reps : undefined });
  await u.model(model, re);
  await u.xAlreadyLog(xLog);
  for (const [p, v] of Object.entries(constrain)) await u.constrain(p, v);
  u.mark();
  await u.settle(`${model}`);
  return u.snap();
}
const bookParams = (f, map) => {
  const got = {};
  for (const [q, name] of Object.entries(map)) {
    const key = Object.keys(f.p).find((n) => (name instanceof RegExp ? name.test(n) : n === name));
    if (!key) continue;
    got[q] = f.p[key].v; got[`se_${q}`] = f.p[key].se;
    got[`${q}_ci_lower`] = ciPart(f.p[key].ci, 0); got[`${q}_ci_upper`] = ciPart(f.p[key].ci, 1);
  }
  return got;
};
def("gp-book-ch1-bloodpressure", async (u, R) => {
  const s = await bookFit(u, "agonist variable slope four", /^log\(agonist\) vs\. response -- Variable slope/, { reps: 3, constrain: { Bottom: 0 } });
  const f = fitOf(s);
  return { ...bookParams(f, { Top: "Top", LogEC50: /^LogEC50/, HillSlope: "HillSlope" }), df: f.stats.df, R2: f.stats.r2, residual_ss: f.stats.ss, sy_x: f.stats.syx };
});
async function twoSite(u, R, reps) {
  const got = {};
  let s = await bookFit(u, "competition", /^One site -- Fit logIC50/, { reps });
  let f = fitOf(s);
  const one = bookParams(f, { Bottom: "Bottom", Top: "Top", LogEC50: /^Log(IC|EC)50$/ });
  for (const [k, v] of Object.entries(one)) got[`one.${k.replace(/^se_(\w+)/, "se_$1")}`] = v;
  Object.assign(got, { "one.df": f.stats.df, "one.R2": f.stats.r2, "one.residual_ss": f.stats.ss, "one.sy_x": f.stats.syx });
  await u.model("competition", /^Two sites -- Fit logIC50/);
  await u.settle("two-site competition");
  s = await u.snap();
  f = fitOf(s);
  const two = bookParams(f, { Bottom: "Bottom", Top: "Top", Fraction1: /^Frac/, LogEC50_1: /^Log(IC|EC)50.?1|^Log(IC|EC)50_?Hi/i, LogEC50_2: /^Log(IC|EC)50.?2|^Log(IC|EC)50_?Lo/i });
  for (const [k, v] of Object.entries(two)) got[`two.${k}`] = v;
  Object.assign(got, { "two.df": f.stats.df, "two.R2": f.stats.r2, "two.residual_ss": f.stats.ss, "two.sy_x": f.stats.syx });
  got.__notes = [`two-site parameters: ${Object.keys(f.p).join(", ")}`];
  return got;
}
def("gp-book-twosite-ex1", async (u, R) => (u.friction("missing", "The curve fit cannot compare two models (extra-sum-of-squares F test, AICc / probability, or one global fit against separate fits), so one-site vs two-site, Hill slope vs 1, Schild slope vs 1 and shared-vs-separate dose-response comparisons are unavailable."), { ...(await twoSite(u, R, 1)), __why: (q) => (/^(F|F_dfn|F_dfd|p|AICc_one|AICc_two|prob_two_site_percent|evidence_ratio)$/.test(q) ? NO_COMPARE : null) }));
def("gp-book-twosite-ex2", async (u, R) => ({ ...(await twoSite(u, R, 3)), __why: (q) => (/^(F|p|AICc_one|AICc_two|evidence_ratio)$/.test(q) ? NO_COMPARE : null) }));
def("gp-book-hillslope-test", async (u, R) => {
  let s = await bookFit(u, "agonist variable slope four", /^log\(agonist\) vs\. response -- Variable slope/, { reps: 2 });
  let f = fitOf(s);
  const got = { ...bookParams(f, { Bottom: "Bottom", Top: "Top", LogEC50: /^LogEC50/, HillSlope: "HillSlope" }), ss_free: f.stats.ss, df_free: f.stats.df };
  await u.model("agonist three parameters", /^log\(agonist\) vs\. response -- \(three parameters\)/);
  await u.settle("Hill slope = 1");
  s = await u.snap(); f = fitOf(s);
  got.ss_slope1 = f.stats.ss; got.df_slope1 = f.stats.df;
  return { ...got, __why: (q) => (/^(F|p|AICc_slope1|AICc_free|evidence_ratio|t_test_p)$/.test(q) ? NO_COMPARE : null) };
});
def("gp-book-enzyme-mm", async (u, R) => {
  const s = await bookFit(u, "michaelis", /^Michaelis-Menten$/);
  const f = fitOf(s);
  return { ...bookParams(f, { Vmax: "Vmax", Km: "Km" }), residual_ss: f.stats.ss, sy_x: f.stats.syx,
    __why: (q) => (/montecarlo|joint|F_crit|ss_target/.test(q) ? "not shown: joint confidence regions / Monte Carlo CIs of this kind are not part of the fit results (the Monte Carlo tool simulates new data sets instead)" : null) };
});
def("gp-book-normalized-2param", async (u, R) => {
  const s = await bookFit(u, "agonist normalized variable", /^log\(agonist\) vs\. normalized response -- Variable slope/, { reps: 3 });
  const f = fitOf(s);
  return { ...bookParams(f, { LogEC50: /^LogEC50/, HillSlope: "HillSlope" }), residual_ss: f.stats.ss, sy_x: f.stats.syx, df: f.stats.df,
    __why: (q) => (/joint/.test(q) ? "not shown: joint (2-D) confidence region limits" : null) };
});
def("gp-book-operational-depletion", async (u, R) => {
  const s = await bookFit(u, "operational depletion", /^Operational model - Depletion, X is log/, { sets: 2 });
  const all = fits(s);
  const [a, b] = [all[0] ?? { p: {} }, all[1] ?? { p: {} }];
  const got = { ...bookParams(a, { logKA: /^log ?KA$/i, n: /^n$/, Basal: "Basal", Emax: /^Emax|^Effectmax/ }) };
  const lt = (f) => Object.keys(f.p).find((n) => /^log ?tau/i.test(n));
  got.logtau_vehicle = a.p[lt(a)]?.v; got.se_logtau_vehicle = a.p[lt(a)]?.se;
  got.logtau_alkylated = b.p[lt(b)]?.v; got.se_logtau_alkylated = b.p[lt(b)]?.se;
  return { ...got, __notes: [`parameters: ${Object.keys(a.p).join(", ")}`] };
});
def("gp-book-operational-partial", async (u, R) => {
  const s = await bookFit(u, "operational partial", /^Operational model - Partial agonist, X is log/, { sets: 2 });
  const all = fits(s);
  const [a, b] = [all[0] ?? { p: {} }, all[1] ?? { p: {} }];
  const find = (f, re) => Object.keys(f.p).find((n) => re.test(n));
  const got = {};
  for (const [q, re] of [["Basal", /^Basal/], ["Emax", /^Emax|^Effectmax/], ["n", /^n$/], ["logEC50_full", /^log ?EC50/i]]) {
    const f = [a, b].find((x) => find(x, re));
    if (!f) continue;
    got[q] = f.p[find(f, re)].v; got[`se_${q === "logEC50_full" ? "logEC50" : q}`] = f.p[find(f, re)].se;
  }
  for (const [q, re] of [["logKA_partial", /^log ?KA/i], ["logtau_partial", /^log ?tau/i]]) {
    const f = [b, a].find((x) => find(x, re));
    if (!f) continue;
    got[q] = f.p[find(f, re)].v; got[`se_${q.split("_")[0]}`] = f.p[find(f, re)].se;
  }
  return { ...got, __notes: [`parameters: ${all.map((f) => Object.keys(f.p).join(",")).join(" | ")}`] };
});
def("gp-book-schild-global", async (u, R) => {
  const csv = u.csv();
  const concs = header(csv).slice(1).map((h) => Number(h.replace(/^NMS_/, "").replace(/_M$/, "")));
  const s0 = await bookFit(u, "gaddum", /^Gaddum\/Schild EC50 shift, X is log/, { sets: concs.length });
  // antagonist concentration of each data set
  for (let i = 0; i < concs.length; i++) {
    const inp = u.page.locator(".controls input[aria-label*='for']").nth(i);
    if (await inp.count()) await inp.fill(String(concs[i]));
  }
  u.mark();
  await u.settle("Gaddum/Schild with antagonist concentrations");
  let s = await u.snap();
  let f = fitOf(s);
  const got = { ...bookParams(f, { LogEC50: /^LogEC50/, pA2: /^pA2/, Bottom: "Bottom", Top: "Top", HillSlope: "HillSlope" }) };
  // Schild slope fixed to 1 after the F test: the SchildSlope = 1 model
  await u.model("gaddum", /^Gaddum\/Schild EC50 shift \(SchildSlope=1\), X is log/);
  for (let i = 0; i < concs.length; i++) {
    const inp = u.page.locator(".controls input[aria-label*='for']").nth(i);
    if (await inp.count()) await inp.fill(String(concs[i]));
  }
  u.mark();
  await u.settle("Gaddum/Schild, SchildSlope = 1");
  s = await u.snap(); f = fitOf(s);
  Object.assign(got, bookParams(f, { LogEC50: /^LogEC50/, pA2: /^pA2/, Bottom: "Bottom", Top: "Top", HillSlope: "HillSlope" }));
  void s0;
  return { ...got, __notes: [`parameters: ${Object.keys(f.p).join(", ")}`],
    __why: (q) => (/schild_slope_F|F_df/.test(q) ? NO_COMPARE : /Kb_nM/.test(q) ? "not shown: Kb is not reported (pA2 is)" : null) };
});
def("gp-stats-ratio-ttest", async (u, R) => {
  await u.newTable("column", u.id, { "Groups (columns)": 2 });
  await u.paste(u.csv());
  await ttest(u, "paired");
  let s = await u.snap();
  const ci = R.cell(s, /^95% CI of difference/)?.split(" to ");
  const got = { "paired.p": R.cell(s, /^P value/), "paired.ci_lower": ci && { s: ci[1], conv: (v) => -v, note: "page difference is control − treated" }, "paired.ci_upper": ci && { s: ci[0], conv: (v) => -v } };
  await ttest(u, "ratio_paired");
  s = await u.snap();
  got["ratio.p"] = R.cell(s, /^P value/);
  const mlog = R.row(s, /^Mean of (log|differences)/i);
  got["ratio.mean_log10_diff_control_minus_treated"] = mlog?.[1];
  const lci = R.cell(s, /^95% CI of (the )?(mean )?(log|difference)/i)?.split(" to ");
  got["ratio.ci_lower_log10"] = lci?.[0]; got["ratio.ci_upper_log10"] = lci?.[1];
  const gm = R.row(s, /ratio/i, { inT: null });
  const rci = (R.cell(s, /^95% CI of (the )?ratio/i) ?? "").split(" to ");
  got["ratio.geometric_mean_ratio_control_over_treated"] = R.cell(s, /^Geometric mean (of )?ratio|^Ratio of geometric means|^Mean ratio/i);
  got["ratio.ratio_ci_lower"] = rci[0] || null; got["ratio.ratio_ci_upper"] = rci[1] || null;
  void gm;
  return got;
});
