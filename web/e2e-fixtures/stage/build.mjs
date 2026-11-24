// Writes the worst-content project files the stage harness
// (scripts/ui-stage.mjs) opens. Deterministic: rerun it after a project
// format change and commit the JSON it writes next to it.
//
// Usage (from web/): node e2e-fixtures/stage/build.mjs
//
//   long-names.json    80-character names and titles everywhere, unicode
//                      (µ, °, ≥, Greek, CJK), a 140-character project title
//   big-table.json     40 columns x 1,200 rows, a one-way ANOVA with
//                      Tukey (780 comparisons: a long results sheet)
//   failures.json      a 4PL fit on data no sigmoid describes, a fit with
//                      too few points, a t test with one value per group
//   empty-project.json no sheets at all
//   empty-states.json  an empty table, a table with no analysis, results
//                      of a table that has no values
//   row-ids.json       animal IDs as row titles (Find, Exclude by ID), an
//                      Info constant used as "@Name", a contingency graph
//   box-plot.json      a column box plot (rank (n + 1)p quartiles, an outlier)
//   fit-graph.json     the example dose-response with IC50 drop lines and
//                      their value label on its curve-fit graph
//   contingency-brackets.json  pairs of rows (Holm) as brackets on a
//                      stacked percent contingency graph (P-14)
//   estimation-margins.json  a t test with an equivalence margin of ±1 and
//                      the estimation plot that draws it (P-12)
//   fit-split-axis.json  IC50 drop lines on a Y axis with a break (P-23)
//   fit-legend.json    a weighted 4PL with a confidence band and one ROUT
//                      outlier, its legend sentence drawn in the figure
//   bar-axis.json      fold changes as bars of geometric means ×/÷ geometric
//                      SD on an axis starting at 1 (the Checks note)
//   rank-test.json     the example column table under Mann-Whitney, its new
//                      graph following the test (median with IQR)
//   raincloud.json     the example column table as a raincloud, plus a
//                      one-value group (no density, named in the legend)
//   pins.json          colours pinned to group names, one under 3:1 on white
//   schild.json        the EC50-shift example with its Schild plot (P-49)
//   why-history.json   a t test with Help me choose's saved reason (P-32)
//                      and a saved reproduction record (P-58)
//   study-design.json  a study design record on the info sheet of a t test (P-61)
//   sex-factor.json    rows F and M of a grouped table under multiple t tests (P-62)
//   normalize-title.json a new Normalize output and its graph, titled "% of vehicle (mean)" (P-55)
//   assay-analysed.json a qPCR plate whose Notes strip names the wells left out (P-16)
//   method-comparison.json Passing-Bablok of Giavarina's Table 1 with its graph
//                      (P-42), Bland-Altman of the ejection fractions with
//                      Lin's CCC (P-43), Shrout & Fleiss's ICC table (P-44)

//   derived-numbers.json quasi-Poisson (P-46), partial and compared correlations
//                      (P-48), survival difference at a time (P-28), the
//                      references of a Normalize (P-57)
//   many-sheets.json   74 sheets: 22 families, navigator groups (one
//                      collapsed), highlights, info sheets and layouts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

let seed = 20261122;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
let n = 0;
const id = (p) => `${p}${String(++n).padStart(3, "0")}`;

/** Pads or cuts a name to exactly `len` characters with unicode-heavy
 *  filler, so every long name is the same worst-case length. */
const FILL = " · β-arrestin ≥ 37 °C, 10 µM, Δt = 72 h, 肝細胞 donor 天津-04, α/γ ratio, n ≥ 3";
const L = (s, len = 80) => (s + FILL + FILL).slice(0, len).trimEnd().padEnd(len, "·");

const PREFS = { defaultTableType: "xy", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 };

function table(type, { x = [], xTitle = "", yTitle = "", rowTitles, datasets, xUnit = "" }) {
  const rows = Math.max(x.length, rowTitles?.length ?? 0, ...datasets.map((d) => d.rows.length));
  return {
    type, x: x.length ? x : Array(rows).fill(""), xTitle, xFormat: "numbers", xUnit, yTitle,
    rowTitles: rowTitles ?? Array(rows).fill(""), datasets,
    subcolumnFormat: "replicates", replicateLayout: "side_by_side",
  };
}
const data = (name, t, extra = {}) => ({ id: id("d"), kind: "data", name, table: t, ...extra });
const results = (parent, analysis, options, name, extra = {}) =>
  ({ id: id("r"), kind: "results", parentId: parent.id, analysis, options, name, ...extra });
const graph = (parent, res, graphType, name, titles = { x: "", y: "" }, extra = {}) =>
  ({ id: id("g"), kind: "graph", parentId: parent.id, resultsId: res?.id ?? null, graphType,
    settings: { titles, scheme: "default" }, name, ...extra });
const info = (name, notes, constants = [], parentId = null) =>
  ({ id: id("i"), kind: "info", name, parentId, notes, constants });
const layout = (name, graphIds, rows = 2, cols = 2) =>
  ({ id: id("l"), kind: "layout", name, graphIds, grid: { rows, cols } });
const project = (title, sheets, extra = {}) =>
  ({ opendose_project: 2, version: 2, title, prefs: PREFS, ...extra, sheets });

const col = (name, values) => ({ name, rows: values.map((v) => [v === "" ? "" : String(v)]) });
const fixed = (v, d = 2) => v.toFixed(d);
const doses = ["1e-9", "3.162e-9", "1e-8", "3.162e-8", "1e-7", "3.162e-7", "1e-6", "3.162e-6", "1e-5"];
const sigmoid = (x, ec50, top = 100, bottom = 2) => bottom + (top - bottom) / (1 + (x / ec50));

function write(name, p, compact = false) {
  writeFileSync(join(here, name), `${JSON.stringify(p, null, compact ? undefined : 1)}\n`);
  console.log(`${name}: ${p.sheets.length} sheets`);
}

// ------------------------------------------------------------ long names
{
  n = 0;
  const colT = data(L("Hepatocyte viability after compound β-12, 72 h"), table("column", {
    rowTitles: Array.from({ length: 8 }, (_, i) => L(`Well ${String.fromCharCode(65 + i)}${i + 1}, plate 天津`, 60)),
    datasets: ["Vehicle (0.1 % DMSO)", "β-12 at 1 µM", "β-12 at 10 µM", "β-12 at ≥ 100 µM",
      "Staurosporine 1 µM, positive control", "Untreated, 37 °C"]
      .map((g, k) => col(L(g), Array.from({ length: 8 }, () => fixed(100 - 9 * k + 4 * gauss(), 1)))),
  }));
  const colR = results(colT, "column", { analysis: "anova" },
    L("One-way ANOVA of hepatocyte viability, Tukey's multiple comparisons, α = 0.05"));
  const colG = graph(colT, colR, "scatter", L("Graph: hepatocyte viability by treatment, mean ± SD"),
    { x: L("Treatment (compound β-12 concentration, µM)"), y: L("Viability (% of vehicle, mean ± SD, n ≥ 3)") });
  const xyT = data(L("Dose response of receptor occupancy, Δ[Ca²⁺]ᵢ, 25 °C"), table("xy", {
    x: doses, xTitle: L("log[agonist] (M), 受容体アゴニスト"), yTitle: L("Δ[Ca²⁺]ᵢ response (% of maximum)"), xUnit: "M",
    datasets: ["Wild type, β₂-adrenergic", "Knock-out, Gαs-deficient", "Rescue, Gαs re-expressed"].map((g, k) => ({
      name: L(g),
      rows: doses.map((d) => [0, 1, 2].map(() => fixed(sigmoid(Number(d), 3e-8 * (k + 1)) + 3 * gauss(), 1))),
    })),
  }));
  const xyR = results(xyT, "nonlin", { model: "log_inhibitor_vs_response_4pl" },
    L("Nonlinear fit: log(inhibitor) vs. response, variable slope (four parameters)"));
  const xyG = graph(xyT, xyR, "xy", L("Graph: concentration-response curves with 95 % confidence bands"),
    { x: L("log[agonist] (M)"), y: L("Response (% of maximum Δ[Ca²⁺]ᵢ)") });
  const inf = info(L("Methods notes: cell culture, compound handling, statistics"),
    `${L("Cells were seeded at 2 × 10⁴ per well", 200)}\n\n${L("Compound β-12 was dissolved in DMSO", 300)}`,
    [{ name: L("Incubation temperature (°C)", 60), value: "37" }, { name: L("Seeding density per well", 60), value: "2 × 10⁴" }]);
  colT.groupId = "grp1";
  xyT.groupId = "grp1";
  const lay = layout(L("Figure 2: viability and concentration-response, journal page"), [colG.id, xyG.id], 1, 2);
  write("long-names.json", project(
    L("Project: hepatocyte toxicity screen of compound β-12 and receptor pharmacology, 2026 series", 140),
    [colT, xyT, inf, colR, xyR, colG, xyG, lay],
    { selected: colT.id,
      groups: [{ id: "grp1", section: "data", name: L("Experiment group: toxicity screen, donors 天津-01 to 天津-12") }] }));
}

// ------------------------------------------------------------ 40 x 1200
{
  n = 0;
  const ROWS = 1200;
  const datasets = Array.from({ length: 40 }, (_, k) => col(
    `Compound ${String(k + 1).padStart(2, "0")} at ${[0.1, 1, 10, 100][k % 4]} µM`,
    Array.from({ length: ROWS }, (_, i) => ((i * 7 + k) % 97 === 0 ? "" : fixed(50 + k * 0.6 + 8 * gauss(), 3)))));
  const t = data("Screen: 40 compounds × 1,200 cells", table("column", { datasets }));
  const r = results(t, "column", { analysis: "anova", comparisons: "tukey" }, "One-way ANOVA of the screen, Tukey");
  const g = graph(t, r, "scatter", "Graph of the screen");
  write("big-table.json", project("Large screen", [t, r, g], { selected: t.id }), true);
}

// ------------------------------------------------------------ failures
{
  n = 0;
  // Bell-shaped, non-monotonic data: no sigmoid describes it.
  const bell = data("No sigmoid: bell-shaped response", table("xy", {
    x: doses, xTitle: "Dose", xUnit: "M",
    datasets: [{ name: "Response", rows: doses.map((_, i) => [0, 1, 2].map(() =>
      fixed(20 + 70 * Math.exp(-((i - 4) ** 2) / 2) + 6 * gauss(), 1))) }],
  }));
  const bellR = results(bell, "nonlin", { model: "log_inhibitor_vs_response_4pl" }, "Failed fit: 4PL on a bell curve");
  const bellG = graph(bell, bellR, "xy", "Graph of the failed fit");
  // Two points cannot pin four parameters.
  const two = data("Too few points: two doses", table("xy", {
    x: ["1e-8", "1e-6"], xTitle: "Dose", xUnit: "M",
    datasets: [{ name: "Response", rows: [["95"], ["12"]] }],
  }));
  const twoR = results(two, "nonlin", { model: "log_inhibitor_vs_response_4pl" }, "Fit that errors: 4PL on two points");
  // One value per group: a t test has no variance to work with.
  const one = data("One value per group", table("column", {
    datasets: [col("Control", ["10"]), col("Treated", ["14"])],
  }));
  const oneR = results(one, "column", { analysis: "ttest" }, "t test with one value per group");
  // Text where numbers belong.
  const txt = data("Text instead of numbers", table("column", {
    datasets: [col("Control", ["n/a", "low", "#DIV/0!"]), col("Treated", ["high", "?", "—"])],
  }));
  const txtR = results(txt, "column", { analysis: "ttest" }, "t test of text cells");
  write("failures.json", project("Failures", [bell, two, one, txt, bellR, twoR, oneR, txtR, bellG],
    { selected: bell.id }));
}

// ------------------------------------------------------------ empties
{
  n = 0;
  write("empty-project.json", project("Empty project", []));
  const empty = data("Empty XY table", table("xy", { x: Array(6).fill(""), xUnit: "M",
    datasets: [{ name: "", rows: Array.from({ length: 6 }, () => ["", "", ""]) }] }));
  const noAnalysis = data("Table with no analysis", table("column", {
    datasets: [col("Control", [10.1, 11.4, 9.6, 10.8]), col("Treated", [13.9, 15.2, 12.8, 14.4])],
  }));
  const blank = data("Results with no data", table("column", {
    datasets: [col("Control", ["", "", ""]), col("Treated", ["", "", ""])],
  }));
  const blankR = results(blank, "column", { analysis: "ttest" }, "t test of an empty table");
  const blankG = graph(blank, blankR, "scatter", "Graph of an empty table");
  write("empty-states.json", project("Empty states", [empty, noAnalysis, blank, blankR, blankG],
    { selected: empty.id }));
}

// ------------------------------------------------------------ row IDs
// Find, Exclude by ID, a contingency graph and an Info constant used as
// "@Name" in an analysis option.
{
  n = 0;
  const animals = Array.from({ length: 12 }, (_, i) => `M${i + 1}`);
  const weights = data("Body weight by animal", table("column", { rowTitles: animals, yTitle: "Weight (g)",
    datasets: ["Vehicle", "Low dose", "High dose"].map((g, k) =>
      col(g, animals.map((_, i) => fixed(24 - 1.5 * k + ((i * 7 + k * 3) % 11) / 5 - 1, 1)))) }));
  const weightsR = results(weights, "column",
    { analysis: "column_statistics", hypothetical: "@Expected_weight" }, "Descriptive statistics of Body weight by animal");
  const constants = info("Study constants", "Values the analyses read.",
    [{ name: "Expected weight", value: "24" }, { name: "Dilution factor", value: "10" }]);
  const outcome = data("Response by treatment", table("contingency", {
    rowTitles: ["Vehicle", "Low dose", "High dose"],
    datasets: [{ name: "Responded", rows: [["4"], ["9"], ["15"]] },
      { name: "No response", rows: [["16"], ["11"], ["5"]] }] }));
  const outcomeR = results(outcome, "contingency", {}, "Chi-square of Response by treatment");
  const outcomeG = graph(outcome, null, "contingency_stacked_percent", "Graph of Response by treatment");
  write("row-ids.json", project("Row IDs and constants",
    [weights, weightsR, constants, outcome, outcomeR, outcomeG], { selected: weights.id }));
}

// ------------------------------------------------------------ many sheets
{
  n = 0;
  const groups = [
    { id: "gA", section: "data", name: "Experiment 1: dose response" },
    { id: "gB", section: "data", name: "Experiment 2: viability" },
    { id: "gC", section: "data", name: "Archived pilot runs", collapsed: true },
    { id: "gR", section: "results", name: "Fits to report" },
    { id: "gG", section: "graph", name: "Figure 3 panels" },
  ];
  const HL = ["red", "orange", "yellow", "green", "blue", "purple"];
  const sheets = [];
  const graphIds = [];
  for (let f = 0; f < 22; f++) {
    const xy = f % 2 === 0;
    const name = xy ? `Dose response ${f + 1}: compound ${String.fromCharCode(65 + (f % 26))}`
      : `Viability ${f + 1}: donor ${f + 3}`;
    const t = xy
      ? data(name, table("xy", { x: doses, xUnit: "M", datasets: [{ name: "Drug",
        rows: doses.map((d) => [0, 1, 2].map(() => fixed(sigmoid(Number(d), 1e-7 * (1 + f / 10)) + 3 * gauss(), 1))) }] }))
      : data(name, table("column", { datasets: ["Control", "Low", "High"].map((g, k) =>
        col(g, Array.from({ length: 6 }, () => fixed(100 - 12 * k + 5 * gauss(), 1)))) }));
    if (f < 8) t.groupId = "gA"; else if (f < 14) t.groupId = "gB"; else if (f >= 18) t.groupId = "gC";
    if (f % 5 === 0) t.highlight = HL[f % HL.length];
    const r = xy ? results(t, "nonlin", { model: "log_inhibitor_vs_response_4pl" }, `Nonlin fit of ${name}`)
      : results(t, "column", { analysis: "anova" }, `One-way ANOVA of ${name}`);
    if (f < 4) r.groupId = "gR";
    const g = graph(t, r, xy ? "xy" : "scatter", `Graph of ${name}`);
    if (f < 4) g.groupId = "gG";
    graphIds.push(g.id);
    sheets.push(t, r, g);
    // a family with several analyses: deeper nesting
    if (f === 1) {
      sheets.push(results(t, "column", { analysis: "column_statistics" }, `Descriptive statistics of ${name}`),
        results(t, "column", { analysis: "ttest" }, `t test of ${name}`));
    }
  }
  sheets.push(info("Project notes", "Shared protocol notes."), info("Plate maps", "Plate 1 to 8."),
    info("Reagent lot numbers", "Lot 2026-11."));
  sheets.push(layout("Figure 1", graphIds.slice(0, 4)), layout("Figure 2", graphIds.slice(4, 8)),
    layout("Supplementary figure", graphIds.slice(8, 14), 3, 2));
  write("many-sheets.json", project("Sixty-plus sheets", sheets, { groups, selected: sheets[0].id }));
}

// box-plot.json: a column box plot whose column statistics use rank
// (n + 1)p percentiles, with an outlier past the Tukey whisker
{
  const t = data("Box plot data", table("column", { yTitle: "Response (%)", datasets: [
    col("Control", [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]),
    col("Treated", [12, 14, 15, 15, 16, 18, 19, 21, 22, 24]),
  ] }));
  const r = results(t, "column", { analysis: "column_statistics", percentileMethod: "prism" },
    "Column statistics of Box plot data");
  const g = graph(t, r, "box", "Box plot");
  g.settings.column = { caption: "below" };
  write("box-plot.json", project("Box plot", [t, r, g], { selected: g.id }));
}

// fit-graph.json: the example dose-response with the IC50 drop lines and
// their label on (sheets/xy/fitGraph.ts)
{
  const reps = [["98.2", "101.5", "99.1"], ["97.0", "95.8", "99.9"], ["93.4", "90.1", "92.7"],
    ["78.9", "82.3", "80.0"], ["51.2", "48.7", "50.9"], ["22.1", "25.6", "24.0"],
    ["8.9", "10.2", "7.5"], ["3.1", "4.4", "2.2"], ["1.0", "0.5", "2.1"]];
  const t = data("Dose response", table("xy", { x: doses, xTitle: "[Conc.]", xUnit: "M",
    yTitle: "Response", datasets: [{ name: "Drug A", subTitles: ["", "", ""], rows: reps }] }));
  const r = results(t, "nonlin", { model: "log_inhibitor_vs_response_4pl", errorBars: "sd",
    autoFit: "requested" }, "Nonlin fit of Dose response");
  const g = graph(t, r, "xy", "Graph of Dose response");
  g.settings.xy = { dropLines: true, dropLabel: true };
  write("fit-graph.json", project("Fit graph", [t, r, g], { selected: g.id }));
}

// fit-legend.json: the curve-fit legend in the figure (sheets/xy/fitLegend.ts)
{
  const reps = [["98.2", "101.5", "99.1"], ["97.0", "95.8", "99.9"], ["93.4", "90.1", "92.7"],
    ["78.9", "82.3", "80.0"], ["30.0", "48.7", "50.9"], ["22.1", "25.6", "24.0"],
    ["8.9", "10.2", "7.5"], ["3.1", "4.4", "2.2"], ["1.0", "0.5", "2.1"]];
  const t = data("ROUT fit", table("xy", { x: doses, xTitle: "[Conc.]", xUnit: "M",
    yTitle: "Response", datasets: [{ name: "Drug A", subTitles: ["", "", ""], rows: reps }] }));
  const r = results(t, "nonlin", { model: "log_inhibitor_vs_response_4pl", errorBars: "sd",
    autoFit: "requested", weighting: "1/Y2", routEnabled: true, routQ: "1", bands: "confidence" },
  "Nonlin fit of ROUT fit");
  const g = graph(t, r, "xy", "Graph of ROUT fit");
  g.settings.xy = { caption: "figure" };
  write("fit-legend.json", project("Fit legend", [t, r, g], { selected: g.id }));
}

// bar-axis.json: geometric means of fold changes as bars on an axis that
// starts at 1 (sheets/column/barAxis.ts, the Checks row note)
{
  const t = data("Fold changes", table("column", { yTitle: "Fold change", datasets: [
    col("Vehicle", [0.8, 1.1, 0.9, 1.2]), col("Drug", [0.5, 1, 2, 4]), col("Drug + inhibitor", [1, 2, 4, 8]),
  ] }));
  const r = results(t, "column", { analysis: "column_statistics" }, "Column stats of Fold changes");
  const g = graph(t, r, "bar", "Graph of Fold changes");
  g.settings.column = { caption: "below", summary: "geo_sd" };
  g.settings.format = { y: { min: 0.4 } };
  write("bar-axis.json", project("Bar axis", [t, r, g], { selected: r.id }));
}

// rank-test.json: Mann-Whitney on the example column table; the graph's
// centre follows the test (sheets/column/rankSummary.ts)
{
  const t = data("Group comparison", table("column", { datasets: [
    col("Control", [23.1, 25.4, 21.8, 24.9, 22.6, 26.0]),
    col("Treated A", [28.4, 30.2, 27.1, 31.5, 29.0, 28.8]),
    col("Treated B", [35.2, 33.9, 37.4, 34.1, 36.6, 35.8]),
  ] }));
  const r = results(t, "column", { analysis: "ttest", ttestKind: "mann_whitney" },
    "Mann-Whitney of Group comparison");
  const g = graph(t, r, "scatter", "Graph of Group comparison");
  g.settings.column = { spread: "symmetric", caption: "below", summary: "auto" };
  write("rank-test.json", project("Rank test", [t, r, g], { selected: r.id }));
}

// raincloud.json: the example column table as a raincloud (P-53), plus a
// group with one value (no density: the legend says so)
{
  const t = data("Group comparison", table("column", { datasets: [
    col("Control", [23.1, 25.4, 21.8, 24.9, 22.6, 26.0]),
    col("Treated A", [28.4, 30.2, 27.1, 31.5, 29.0, 28.8]),
    col("Treated B", [35.2, 33.9, 37.4, 34.1, 36.6, 35.8]),
    col("Pilot", [30.5]),
  ] }));
  const r = results(t, "column", { analysis: "column_statistics" }, "Column stats of Group comparison");
  const g = graph(t, r, "raincloud", "Graph of Group comparison");
  g.settings.column = { spread: "symmetric", caption: "below", summary: "auto", violin: "quartiles" };
  write("raincloud.json", project("Raincloud", [t, r, g], { selected: g.id }));
}

// pins.json: colours pinned to group names (P-56); Okabe-Ito orange for
// "KO" is under 3:1 on white, so Preferences shows the warning
{
  const t = data("Knockout study", table("column", { datasets: [
    col("WT", [10.2, 11.5, 9.8, 10.9]), col("KO", [14.1, 15.3, 13.8, 14.9]), col("Het", [12.0, 12.8, 11.7, 12.4]),
  ] }));
  const g = graph(t, null, "scatter", "Graph of Knockout study");
  g.settings.column = { spread: "symmetric", caption: "below", summary: "auto" };
  write("pins.json", project("Pinned colours", [t, g], { selected: g.id,
    groupColors: [{ name: "KO", color: "#e69f00" }, { name: "WT", color: "#0072b2" }] }));
}

// schild.json: the EC50-shift example (engine/tests/reference/
// schild_plot.py) with its Schild plot (P-49)
{
  const ref = JSON.parse(readFileSync(join(here, "..", "..", "..", "engine", "tests", "reference",
    "schild_example.json"), "utf8")).data;
  const t = data("EC50 shift", table("xy", { x: ref.x.map(String), xTitle: "log[Agonist]",
    yTitle: "Response", xUnit: "M",
    datasets: ref.names.map((n, i) => ({ name: n, subTitles: ["", ""], rows: ref.ys[i].map((r) => r.map(String)) })) }));
  const r = results(t, "nonlin", { model: "ec50_shift", xIsLog: true, autoFit: "requested",
    schildSlopeUnity: false, antagonist: ref.antagonist.join(", ") }, "Nonlin fit of EC50 shift");
  const g = graph(t, r, "xy", "Graph of EC50 shift");
  const s = graph(t, r, "schild_plot", "Schild plot of EC50 shift");
  write("schild.json", project("EC50 shift", [t, r, g, s], { selected: r.id }));
}

/** A multiple-variables (long) table, one string array per row. */
const longData = (name, names, rows, categorical) => data(name, {
  type: "multivariable", x: rows.map(() => ""), xTitle: "", xFormat: "numbers", xUnit: "", yTitle: "",
  rowTitles: rows.map((_, i) => String(i + 1)),
  datasets: names.map((n, c) => ({ name: n, varType: categorical.includes(n) ? "categorical" : "continuous",
    rows: rows.map((r) => [r[c] ?? ""]) })),
  subcolumnFormat: "replicates", replicateLayout: "side_by_side",
});

// detection-limits.json: an ELISA standard curve with 20 blank wells and
// 20 wells of one low-level sample (engine/tests/reference/
// detection_limits.py, the FEATURE-PLAN P-29 acceptance data): LoB, LoD
// and LoQ (CLSI EP17-A2) next to the LLOQ and ULOQ
{
  const concs = ["1000", "500", "250", "125", "62.5", "31.25", "15.63", "7.81"];
  const std = [[2.243, 2.268], [1.969, 1.969], [1.559, 1.548], [1.087, 1.077],
    [0.674, 0.654], [0.38, 0.375], [0.212, 0.209], [0.138, 0.135]];
  const blanks = [0.057, 0.058, 0.062, 0.062, 0.063, 0.064, 0.072, 0.061, 0.061, 0.051,
    0.053, 0.069, 0.071, 0.062, 0.06, 0.062, 0.052, 0.058, 0.058, 0.067];
  const low = [0.113, 0.121, 0.123, 0.125, 0.116, 0.115, 0.106, 0.126, 0.126, 0.116,
    0.12, 0.11, 0.118, 0.123, 0.116, 0.119, 0.125, 0.122, 0.115, 0.129];
  const pair = (v, i) => [String(v[2 * i]), String(v[2 * i + 1])];
  const rows = [
    ...concs.map((c, i) => ["Standard", `Std ${i + 1}`, "", c, "", ...std[i].map(String)]),
    ...Array.from({ length: 10 }, (_, i) => ["Blank", "Blank", "", "0", "", ...pair(blanks, i)]),
    ...Array.from({ length: 10 }, (_, i) => ["Low", "Low", "", "", "", ...pair(low, i)]),
    ["Unknown", "S1", "Control", "", "2", "0.603", "0.581"],
    ["Unknown", "S2", "Control", "", "2", "0.721", "0.703"],
  ];
  const t = longData("ELISA limits", ["Type", "Name", "Group", "Concentration", "Dilution", "Signal 1", "Signal 2"],
    rows, ["Type", "Name", "Group"]);
  const r = results(t, "assay_stdcurve", { unit: "pg/mL" }, "Standard curve of ELISA limits");
  write("detection-limits.json", project("Detection limits", [t, r], { selected: r.id }));
}

// qpcr-controls.json: a hand-built qPCR plate (engine/tests/
// test_qpcr_controls.py) with an NTC well for GAPDH at Cq 34, a clean
// NTC for IL6 and a no-RT well of CON-1 at Cq 21 (FEATURE-PLAN P-30)
{
  const block = {
    GAPDH: { "CON-1": [17.9, 18.0, 18.1], "CON-2": [17.0, 17.1, 17.2], "LPS-1": [18.0, 18.1, 18.2], "LPS-2": [17.4, 17.5, 17.6] },
    IL6: { "CON-1": [27.3, 27.3, 27.3], "CON-2": [27.0, 27.0, 27.0], "LPS-1": [24.1, 24.1, 24.1], "LPS-2": [24.3, 24.3, 24.3] },
  };
  const rows = [];
  for (const [target, samples] of Object.entries(block)) {
    for (const [s, cqs] of Object.entries(samples)) for (const c of cqs) rows.push([s, s.split("-")[0], target, String(c)]);
  }
  rows.push(["NTC", "", "GAPDH", "34"], ["NTC", "", "GAPDH", "Undetermined"], ["NTC", "", "IL6", "Undetermined"],
    ["CON-1 no-RT", "CON", "GAPDH", "21"]);
  rows.forEach((r, i) => r.push(`${"ABCDEFGH"[Math.floor(i / 12)]}${(i % 12) + 1}`));
  const t = longData("qPCR controls", ["Sample", "Group", "Target", "Cq", "Well"], rows,
    ["Sample", "Group", "Target", "Well"]);
  const r = results(t, "assay_qpcr", { referenceGenes: ["GAPDH"], calibrator: "CON" }, "qPCR of qPCR controls");
  write("qpcr-controls.json", project("qPCR controls", [t, r], { selected: r.id }));
}

// qpcr-lod.json: a qPCR plate with an IL6 hit-rate dilution series, 8
// quantities x 12 wells (engine/tests/reference/lod95_probit.py,
// FEATURE-PLAN P-29): the LoD95 by probit, 26.17 copies (15 to 76.6)
{
  const rows = [];
  [["CON-1", "CON", 18.0, 27.3], ["CON-2", "CON", 17.1, 27.0], ["LPS-1", "LPS", 18.1, 24.1], ["LPS-2", "LPS", 17.5, 24.4]]
    .forEach(([s, g, gapdh, il6]) => {
      for (let i = 0; i < 3; i++) {
        rows.push([s, g, "GAPDH", (gapdh + 0.1 * (i - 1)).toFixed(2), ""], [s, g, "IL6", (il6 + 0.1 * (i - 1)).toFixed(2), ""]);
      }
    });
  const quantity = [1000, 100, 50, 20, 10, 5, 2, 1];
  const detected = [12, 12, 12, 11, 9, 6, 3, 1];
  quantity.forEach((q, i) => {
    for (let w = 0; w < 12; w++) {
      rows.push(["", "", "IL6", w < detected[i] ? (38 - 3.32 * Math.log10(q) + 0.05 * (w % 3)).toFixed(2) : "Undetermined", String(q)]);
    }
  });
  const t = longData("qPCR LoD", ["Sample", "Group", "Target", "Cq", "Quantity"], rows, ["Sample", "Group", "Target"]);
  const r = results(t, "assay_qpcr", { referenceGenes: ["GAPDH"], calibrator: "CON" }, "qPCR of qPCR LoD");
  write("qpcr-lod.json", project("qPCR LoD", [t, r], { selected: r.id }));
}

// why-history.json: a Welch t test opened by Help me choose, with the
// reason saved on its results sheet (P-32), and the project's record of
// a reproduction check (P-58): every compared number came back, one sheet
// was not compared. The record holds counts only, no numbers.
{
  const t = data("Pilot", table("column", { datasets: [
    col("Control", [10.2, 11.5, 9.8, 12.1, 10.9, 11.3]),
    col("Treated", [13.4, 14.1, 12.8, 15.0, 13.9, 14.6]),
  ] }));
  const options = { analysis: "ttest", ttestKind: "welch" };
  const r = results(t, "column", options, "t test of Pilot", { chosen: {
    test: "Unpaired t test with Welch's correction",
    reason: "Two independent groups. Welch's t test does not assume the two populations "
      + "have equal SDs, loses very little power when they do, and keeps the P value "
      + "honest when they do not (especially with unequal n), so it is the safer default "
      + "unless you know the SDs are equal.",
    analysis: "column", options } });
  const g = graph(t, r, "scatter", "Graph of Pilot");
  const reproductions = [{
    file: "pilot-2026-10.json", savedWith: { app: "0.3.0", engine: "0123456789abcdef" },
    current: { app: "0.4.0", engine: "fedcba9876543210" }, checkedAt: "2026-11-20T09:30:00.000Z",
    digits: 4, sheets: [
      { sheetId: r.id, name: r.name, analysis: "column", status: "reproduced", compared: 14, changes: [] },
      { sheetId: "r999", name: "Old fit", analysis: "nonlin", status: "skipped", compared: 0, changes: [],
        note: "the sheet was removed" },
    ],
  }];
  write("why-history.json", project("Pilot study", [t, r, g], { selected: r.id, reproductions }));
}

// contingency-brackets.json: the P-14 acceptance table (WT 18/20, Het
// 15/20, KO 5/20) with Holm pairs of rows drawn as brackets on its
// stacked percent graph (sheets/contingency/brackets.ts). Last, so the
// ids of the files above stay as they were.
{
  const t = data("Genotypes", table("contingency", { rowTitles: ["WT", "Het", "KO"],
    datasets: [{ name: "Positive", rows: [["18"], ["15"], ["5"]] },
      { name: "Negative", rows: [["2"], ["5"], ["15"]] }] }));
  const r = results(t, "contingency", { pairwise: "holm" }, "Chi-square of Genotypes");
  const g = graph(t, r, "contingency_stacked_percent", "Graph of Genotypes");
  g.settings.format = { comparisons: { show: true } };
  write("contingency-brackets.json", project("Pairs of rows", [t, r, g], { selected: g.id }));
}

// estimation-margins.json: the P-12 acceptance groups (B = A - 0.2) with a
// t test whose equivalence margin is ±1 and an estimation plot that draws
// it (report/estimation/margins.ts)
{
  const A = [10.8, 10.75, 10.55, 10.5, 9.6, 9.65, 9.85, 9.9];
  const t = data("Equivalence", table("column", { yTitle: "Value", datasets: [
    col("A", A), col("B", A.map((v) => +(v - 0.2).toFixed(2)))] }));
  const tt = results(t, "column", { analysis: "ttest", ttestKind: "unpaired", equivalence: "equivalence",
    equivalenceMargin: "1" }, "t test of Equivalence");
  const e = results(t, "estimation", {}, "Estimation of Equivalence");
  const g = graph(t, e, "estimation", "Estimation plot of Equivalence");
  write("estimation-margins.json", project("Equivalence margin", [t, tt, e, g], { selected: g.id }));
}

// fit-split-axis.json: the example dose-response with IC50 drop lines on a
// Y axis broken from 15 to 35: the response at the IC50 (50.42) is on the
// upper segment (sheets/xy/fitGraph.ts gapSegment)
{
  const reps = [["98.2", "101.5", "99.1"], ["97.0", "95.8", "99.9"], ["93.4", "90.1", "92.7"],
    ["78.9", "82.3", "80.0"], ["51.2", "48.7", "50.9"], ["22.1", "25.6", "24.0"],
    ["8.9", "10.2", "7.5"], ["3.1", "4.4", "2.2"], ["1.0", "0.5", "2.1"]];
  const t = data("Dose response", table("xy", { x: doses, xTitle: "[Conc.]", xUnit: "M",
    yTitle: "Response", datasets: [{ name: "Drug A", subTitles: ["", "", ""], rows: reps }] }));
  const r = results(t, "nonlin", { model: "log_inhibitor_vs_response_4pl", errorBars: "sd",
    autoFit: "requested" }, "Nonlin fit of Dose response");
  const g = graph(t, r, "xy", "Graph of Dose response");
  g.settings.xy = { dropLines: true, dropLabel: true };
  g.settings.format = { y: { gap: { from: 15, to: 35 } } };
  write("fit-split-axis.json", project("Fit graph, broken axis", [t, r, g], { selected: g.id }));
}

// study-design.json: a t test whose table has a study design record on
// its info sheet (P-61): randomised with a method and seed, blinding
// stated for three of the four stages (item 5 still open), the animals.
{
  const t = data("Tumour volume", table("column", { yTitle: "Tumour volume (mm³)", datasets: [
    col("Vehicle", [412, 388, 455, 430, 401, 397, 446, 420]),
    col("Drug", [318, 352, 301, 340, 365, 322, 310, 337]),
  ] }));
  const r = results(t, "column", { analysis: "ttest", ttestKind: "welch" }, "t test of Tumour volume");
  const i = { ...info("Study design: Tumour volume", "Pilot cohort 2.", [], t.id), design: {
    randomised: "yes",
    randomisationMethod: "block randomisation (blocks of 4), stratified by sex, from OpenDose's randomisation list",
    seed: "20261123",
    blinding: { allocation: "blinded", conduct: "aware", outcome: "blinded" },
    exclusionCriteria: "Set before the study: animals reaching the humane endpoint (tumour volume over "
      + "1500 mm³ or 20 % weight loss) before day 21 are excluded, and tumours that ulcerate are "
      + "measured but not analysed.",
    sex: "both", strain: "BALB/c nude mice (CAnN.Cg-Foxn1nu/Crl)", age: "6 to 8 weeks at implantation",
  } };
  write("study-design.json", project("Xenograft study", [t, r, i], { selected: i.id }));
}

// sex-factor.json: a grouped table whose rows are F and M under multiple
// t tests (P-62): the Checks row asks whether the rows are sex.
{
  const t = data("Body weight by sex", table("grouped", { yTitle: "Body weight (g)", rowTitles: ["F", "M"],
    datasets: [
      { name: "Vehicle", rows: [["20.1", "21.4", "19.8"], ["26.2", "27.5", "25.9"]] },
      { name: "Drug", rows: [["22.9", "23.6", "24.1"], ["30.4", "31.2", "29.8"]] },
    ] }));
  const r = results(t, "grouped_multiple_t", {}, "Multiple t tests of Body weight by sex");
  write("sex-factor.json", project("Sex as a variable", [t, r], { selected: r.id }));
}

// normalize-title.json: a Normalize made since P-55 (100% = the vehicle
// row's mean), its output table filled by the chain on open, and a graph
// of the output: the Y title and the legend read "% of vehicle (mean)".
{
  const rows = ["10 nM", "1 µM", "vehicle"];
  const src = table("grouped", { yTitle: "Luminescence (RLU)", rowTitles: rows, datasets: [
    { name: "WT", rows: [["20", "22", "21"], ["55", "60", "58"], ["98", "101", "100"]] },
    { name: "KO", rows: [["30", "33", "31"], ["70", "66", "68"], ["99", "97", "103"]] },
  ] });
  const t = data("Viability", src);
  const r = results(t, "normalize", { zeroMode: "smallest", zeroValue: "0", hundredMode: "last",
    hundredValue: "100", asPercent: true, subcolumns: "mean", namedTitle: true }, "Normalize of Viability");
  const out = data("Normalized Viability", { ...src, yTitle: "",
    datasets: src.datasets.map((d) => ({ ...d, rows: d.rows.map((row) => row.map(() => "")) })) },
  { derived: { sourceId: t.id, resultsId: r.id } });
  const g = graph(out, null, "grouped_interleaved", "Graph of Normalized Viability");
  write("normalize-title.json", project("Normalize titles", [t, r, out, g], { selected: g.id }));
}

// rm-reporting.json: the RM ANOVA reporting of P-40 (engine/tests/
// reference/rm_sphericity.py): a 10-subject, 4-condition table under RM
// one-way ANOVA, and pingouin's rm_anova2 data (Metric x Time, both
// repeated, 10 subjects) under two-way RM ANOVA
{
  const ref = JSON.parse(readFileSync(join(here, "../../../engine/tests/reference",
    "rm_sphericity.json"), "utf8"));
  const one = ref.one_way;
  const t = data("RM 10 x 4", table("column", { datasets: one.names.map((nm, j) =>
    col(nm, one.data.map((r) => r[j]))) }));
  const r = results(t, "column", { analysis: "rm_anova", rmKind: "parametric" },
    "RM ANOVA of RM 10 x 4");
  const both = ref.both;
  const t2 = data("Metric by time", table("grouped", { rowTitles: both.row_names,
    datasets: both.col_names.map((nm, j) => ({ name: nm,
      rows: both.cells.map((row) => row[j].map(String)) })) }));
  const r2 = results(t2, "grouped_two_way", { design: "rm_both", rowFactor: "Metric",
    colFactor: "Time" }, "Two-way RM ANOVA of Metric by time");
  // P-41 (engine/tests/reference/ordered_trend.py): four doses under
  // Kruskal-Wallis with the Jonckheere-Terpstra test, the Hicks teaching
  // methods under Friedman with Page's test
  const tr = JSON.parse(readFileSync(join(here, "../../../engine/tests/reference",
    "ordered_trend.json"), "utf8"));
  const t3 = data("Four doses", table("column", { datasets: tr.jt_untied.names.map((nm, j) =>
    col(nm, tr.jt_untied.data[j])) }));
  const r3 = results(t3, "column", { analysis: "anova", anovaKind: "nonparametric",
    rankTrend: true }, "Kruskal-Wallis of Four doses");
  const hk = tr.page_hicks;
  const t4 = data("Teaching methods", table("column", { datasets: hk.names.map((nm, j) =>
    col(nm, hk.data.map((row) => row[j]))) }));
  const r4 = results(t4, "column", { analysis: "rm_anova", rmKind: "nonparametric",
    rankTrend: true }, "Friedman of Teaching methods");
  // P-45 (engine/tests/reference/cochran_q.py): 12 subjects scored 0/1
  // under three stains, Cochran's Q with the pairwise McNemar tests
  const cq = JSON.parse(readFileSync(join(here, "../../../engine/tests/reference",
    "cochran_q.json"), "utf8")).stains;
  const t5 = data("Three stains", table("column", { datasets: cq.names.map((nm, j) =>
    col(nm, cq.data.map((row) => row[j]))) }));
  const r5 = results(t5, "column", { analysis: "cochran_q" }, "Cochran's Q of Three stains");
  // P-27 (engine/tests/reference/rm_corr.py): Bland & Altman's pH and
  // PaCO2 with a Subject column, under repeated-measures correlation
  const rc = JSON.parse(readFileSync(join(here, "../../../engine/tests/reference",
    "rm_corr.json"), "utf8"));
  const t6 = data("pH and PaCO2", table("column", { datasets: [
    col("pH", rc.x), col("PaCO2", rc.y), col("Subject", rc.subject)] }));
  const r6 = results(t6, "column", { analysis: "correlation", corrSubject: "d2" },
    "Correlation of pH and PaCO2");
  write("rm-reporting.json", project("RM reporting",
    [t, r, t2, r2, t3, r3, t4, r4, t5, r5, t6, r6], { selected: r.id }));
}

// assay-analysed.json: a qPCR plate whose Notes strip names what was left
// out (P-16): an "Undetermined" IL6 well, a blank one, an excluded GAPDH
// well, a row without a target, and an NTC
{
  const block = {
    GAPDH: { "CON-1": [17.9, 18.0, 18.1], "CON-2": [17.0, 17.1, 17.2], "LPS-1": [18.0, 18.1, 18.2], "LPS-2": [17.4, 17.5, 17.6] },
    IL6: { "CON-1": [27.3, 27.3, 27.3], "CON-2": [27.0, 27.0, 27.0], "LPS-1": [24.1, 24.1, 24.1], "LPS-2": [24.3, 24.3, 24.3] },
  };
  const rows = [];
  for (const [target, samples] of Object.entries(block)) {
    for (const [s, cqs] of Object.entries(samples)) for (const c of cqs) rows.push([s, s.split("-")[0], target, String(c)]);
  }
  rows[12][3] = "Undetermined";
  rows[13][3] = "";
  rows.push(["NTC", "", "GAPDH", "Undetermined"], ["LPS-2", "LPS", "", "24.2"]);
  rows.forEach((r, i) => r.push(`${"ABCDEFGH"[Math.floor(i / 12)]}${(i % 12) + 1}`));
  const t = longData("qPCR plate 7", ["Sample", "Group", "Target", "Cq", "Well"], rows,
    ["Sample", "Group", "Target", "Well"]);
  t.table.datasets[3].excluded = ["4:0"];
  const r = results(t, "assay_qpcr", { referenceGenes: ["GAPDH"], calibrator: "CON" }, "qPCR of qPCR plate 7");
  write("assay-analysed.json", project("qPCR plate 7", [t, r], { selected: r.id }));
}

// method-comparison.json: P-42 Passing-Bablok on Giavarina (2015) Table 1
// as an XY table (engine/tests/reference/method_regression.py), P-43
// Bland-Altman of the ejection fractions with Lin's CCC (lin_ccc.py),
// P-44 the reliability ICC of Shrout & Fleiss's 6 x 4 (icc_reliability.py)
{
  const mr = JSON.parse(readFileSync(join(here, "../../../engine/tests/reference",
    "method_regression.json"), "utf8"));
  const g = mr.giavarina;
  const t1 = data("Giavarina", table("xy", { x: g.x.map(String), xTitle: "Method A",
    datasets: [col("Method B", g.y)] }));
  const r1 = results(t1, "method_regression", { datasetA: 0, datasetB: 1, ciLevel: "95" },
    "Passing-Bablok of Giavarina");
  const g1 = graph(t1, r1, "method_regression_plot", "Graph of Giavarina");
  const e = mr.ejection;
  const t2 = data("Ejection", table("column", { datasets: [col("RV", e.x), col("IC", e.y)] }));
  const r2 = results(t2, "bland_altman", {}, "Bland-Altman of Ejection");
  const ic = JSON.parse(readFileSync(join(here, "../../../engine/tests/reference",
    "icc_reliability.json"), "utf8")).shrout_fleiss.matrix;
  const t3 = data("Shrout-Fleiss", table("column", { datasets: [0, 1, 2, 3].map((j) =>
    col(`Judge ${j + 1}`, ic.map((r) => r[j]))) }));
  const r3 = results(t3, "icc", { form: "ICC2", ciLevel: "95" }, "ICC of Shrout-Fleiss");
  write("method-comparison.json", project("Method comparison",
    [t1, r1, g1, t2, r2, t3, r3], { selected: r1.id }));
}

// derived-numbers.json (wave 1 misc): the Ames TA98 counts under Poisson
// regression (the overdispersion chip, P-46; engine/tests/reference/
// quasi_poisson.py); four variables under a partial correlation matrix
// controlling for Age and an XY table comparing X vs. SBP with X vs. BMI
// (P-48; partial_compare_corr.py); survival::lung by sex at 365 days
// (P-28; survival_difference.py); the P-55 normalize example and its
// references (P-57)
{
  const ref = (f) => JSON.parse(readFileSync(join(here, "../../../engine/tests/reference", f), "utf8"));
  const qp = ref("quasi_poisson.json").data;
  const ames = longData("Ames TA98", ["Dose", "log(Dose + 10)", "Revertants"],
    qp.dose.map((d, i) => [String(d), String(qp.log_dose_plus_10[i]), String(qp.revertants[i])]), []);
  const rp = results(ames, "mv_poisson", { outcome: "Revertants", predictors: ["Dose", "log(Dose + 10)"],
    interactions: [], referenceLevels: {}, ciLevel: "95", exposure: "", ciMethod: "profile", quasi: false },
  "Poisson regression of Ames TA98");
  const pc = ref("partial_compare_corr.json").table;
  const vars = ["Age", "SBP", "BMI", "Cholesterol"];
  const four = longData("Four variables", vars, pc.Age.map((_, i) => vars.map((v) => String(pc[v][i]))), []);
  const rc = results(four, "mv_correlation", { variables: [], method: "pearson", missing: "pairwise", tails: 2,
    ciLevel: "95", control: ["Age"] }, "Partial correlation of Four variables");
  const xy = data("Same subjects", table("xy", { x: pc.Age.map(String), xTitle: "Age",
    datasets: [col("SBP", pc.SBP), col("BMI", pc.BMI)] }));
  const rx = results(xy, "column", { analysis: "correlation", corrWithX: true, corrCompare: "0,1",
    corrCompareDesign: "auto" }, "Correlation of Same subjects");
  const ind = ref("partial_compare_corr.json").independent_data;
  const two = data("Two samples", table("xy", { xTitle: "Dose",
    x: [...ind["Dose A"], ...ind["Dose B"]].map(String),
    datasets: [col("Response A", [...ind["Response A"], ...ind["Dose B"].map(() => "")]),
      col("Response B", [...ind["Dose A"].map(() => ""), ...ind["Response B"]])] }));
  const rt = results(two, "column", { analysis: "correlation", corrWithX: true, corrCompare: "0,1",
    corrCompareDesign: "auto" }, "Correlation of Two samples");
  const lung = ref("survival_difference.json").groups;
  const surv = data("Lung cancer by sex", { ...table("survival", { xUnit: "days", datasets:
    ["Male", "Female"].map((g) => ({ name: g, subTitles: ["Time", "Event"],
      rows: lung[g].times.map((t, i) => [String(t), String(lung[g].events[i])]) })) }), x: [], rowTitles: [] });
  const rs = results(surv, "survival", { survivalAt: 365 }, "Survival of Lung cancer by sex");
  const rows = ["10 nM", "1 µM", "vehicle"];
  const src = table("grouped", { yTitle: "Luminescence (RLU)", rowTitles: rows, datasets: [
    { name: "WT", rows: [["20", "22", "21"], ["55", "60", "58"], ["98", "101", "100"]] },
    { name: "KO", rows: [["30", "33", "31"], ["70", "66", "68"], ["99", "97", "103"]] },
  ] });
  const nt = data("Viability", src);
  const rn = results(nt, "normalize", { zeroMode: "smallest", zeroValue: "0", hundredMode: "last",
    hundredValue: "100", asPercent: true, subcolumns: "mean", namedTitle: true }, "Normalize of Viability");
  write("derived-numbers.json", project("Derived numbers", [ames, rp, four, rc, xy, rx, two, rt, surv, rs, nt, rn],
    { selected: rp.id }));
}

// lmm.json (P-87): lme4's sleepstudy under the grouping-column mixed model
// with Days as a covariate and a random slope (Satterthwaite df), and the
// synthetic animal / slice / cell design of engine/tests/reference/
// lmm_long.py (genotype fixed, cell size a covariate, slices nested in
// animals, Kenward-Roger df)
{
  const fx = (f) => readFileSync(join(here, "../../../engine/tests/fixtures", f), "utf8").trim().split("\n")
    .slice(1).map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "")));
  const sleep = fx("lme4_sleepstudy.csv").map((r) => [r[1], r[2], r[3]]);
  const st = longData("Sleep study", ["Reaction", "Days", "Subject"], sleep, []);
  const sr = results(st, "mv_mixed_grouping", { outcome: "Reaction", factor1: "", factor2: "",
    grouping: "Subject", covariates: ["Days"], slopes: ["Days"], unit: "other", unitCustom: "subjects",
    comparisons: "tukey", scope: "a_means", controlIndex: 0, ciLevel: 0.95, negativeVariance: "allow",
    mixedDdf: "satterthwaite" }, "Mixed model of Sleep study");
  const recs = JSON.parse(readFileSync(join(here, "../../../engine/tests/reference/lmm_long.json"),
    "utf8")).animals.records;
  const names = ["animal", "slice", "genotype", "size", "current"];
  const at = longData("Patch clamp", names, recs.map((r) => names.map((k) => String(r[k]))),
    ["animal", "slice", "genotype"]);
  const ar = results(at, "mv_mixed_grouping", { outcome: "current", factor1: "genotype", factor2: "",
    grouping: "animal", subgroup: "slice", covariates: ["size"], unit: "animal", unitCustom: "",
    comparisons: "tukey", scope: "a_means", controlIndex: 0, ciLevel: 0.95, negativeVariance: "allow",
    mixedDdf: "kenward_roger" }, "Mixed model of Patch clamp");
  write("lmm.json", project("Mixed models", [st, sr, at, ar], { selected: sr.id }));
}

// contrasts.json (P-83; engine/tests/reference/rm_contrasts.py): the 2 x 2
// mixed design (drug within, genotype between, 6 mice each) under two-way
// RM ANOVA with the Interaction block first; three groups under one-way
// ANOVA with a planned and a post hoc custom contrast; a 2 x 2 ordinary
// two-way ANOVA with a post hoc contrast over its cells
{
  const ref = JSON.parse(readFileSync(join(here, "../../../engine/tests/reference/rm_contrasts.json"), "utf8"));
  const mx = ref.mixed_2x2.records;
  const rm = data("Drug by genotype", table("grouped", { rowTitles: ["Vehicle", "Drug"], yTitle: "Response",
    datasets: ["WT", "KO"].map((g) => ({ name: g,
      rows: ["Vehicle", "Drug"].map((lev) => mx.filter((r) => r.genotype === g).map((r) => String(r[lev]))) })) }));
  const rr = results(rm, "grouped_two_way", { design: "rm_rows", rowFactor: "Drug", colFactor: "Genotype",
    interactionFocus: true }, "Two-way RM ANOVA of Drug by genotype");
  const ow = ref.oneway_custom.groups;
  const three = data("Three groups", table("column", { datasets: Object.entries(ow).map(([nm, v]) => col(nm, v)) }));
  const r3 = results(three, "column", { analysis: "anova", anovaKind: "parametric", comparisons: "none",
    customContrasts: [{ name: "Drugs vs vehicle", coefficients: [-2, 1, 1], planned: true },
      { name: "A vs B", coefficients: [0, 1, -1], planned: false }] }, "One-way ANOVA of Three groups");
  const tw = ref.twoway_custom.records;
  const two = data("Genotype by drug", table("grouped", { rowTitles: ["WT", "KO"], datasets: ["Vehicle", "Drug"]
    .map((c) => ({ name: c, rows: ["WT", "KO"].map((r) => tw.filter((x) => x.row === r && x.col === c)
      .map((x) => String(x.y))) })) }));
  const r2 = results(two, "grouped_two_way", { design: "none", rowFactor: "Genotype", colFactor: "Drug",
    customContrasts: [{ name: "Difference of differences", coefficients: [1, -1, -1, 1], planned: false }] },
  "Two-way ANOVA of Genotype by drug");
  write("contrasts.json", project("Contrasts", [rm, rr, three, r3, two, r2], { selected: rr.id }));
}
