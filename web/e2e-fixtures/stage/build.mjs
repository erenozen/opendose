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
//   fit-legend.json    a weighted 4PL with a confidence band and one ROUT
//                      outlier, its legend sentence drawn in the figure
//   bar-axis.json      fold changes as bars of geometric means ×/÷ geometric
//                      SD on an axis starting at 1 (the Checks note)
//   rank-test.json     the example column table under Mann-Whitney, its new
//                      graph following the test (median with IQR)
//   raincloud.json     the example column table as a raincloud, plus a
//                      one-value group (no density, named in the legend)
//   pins.json          colours pinned to group names, one under 3:1 on white
//   many-sheets.json   74 sheets: 22 families, navigator groups (one
//                      collapsed), highlights, info sheets and layouts
import { writeFileSync } from "node:fs";
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
