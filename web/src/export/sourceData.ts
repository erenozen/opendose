// Source data per figure (P-65): one workbook per page layout, one sheet
// per panel named by its panel letter, holding exactly what the panel
// plots, read from the traces the graph hands Plotly (gd.data): every
// point, the centre and error bars of each group with n, the drawn curve
// and band, the figure legend and the test. eLife asks for the source data
// behind every figure panel (eLife author guide, "Source data"); Nature
// for the data behind each figure, in files up to 30 MB. Pure; the
// layout sheet reads the drawn graphs (layout/sourceData.ts).
import { traceTag, type Trace } from "../graph/apply.ts";
import { sheetNames, writeXlsx, type XlsxCell, type XlsxSheet } from "./xlsx.ts";

export interface PanelInput {
  /** The panel letter as a sheet name: "a", "B". */
  letter: string;
  graph: string;
  data: string;
  /** The figure legend of the graph (report/legendFor.ts): what is
   *  plotted, n and its unit, the test. */
  legend: string;
  /** The test behind the brackets or the fit: "Unpaired t test
   *  (results sheet “t test of Data 1”)"; null when no analysis is bound. */
  test: string | null;
  /** Data set names by trace tag index (`ds`). */
  datasets: string[];
  /** Row titles of the plotted table (points tagged with their row). */
  rowTitles: string[];
  /** X is a category axis: write the axis label of each mark, not its
   *  position (which carries the spread of the points). */
  categorical: boolean;
  /** The X axis ticks, to name a category from its position. */
  xTicks?: { vals: number[]; text: string[] };
  /** The axis titles as drawn: the X and Y columns say what the values
   *  are ("log[Conc.], M": X is what the axis plots, not the dose). */
  xTitle?: string;
  yTitle?: string;
  /** What the centre and the error bars are ("Mean", "SD"), when known. */
  errors: { centre: string; error: string } | null;
  /** n of each data set by name, when no point is drawn to count. */
  groupN: Record<string, number>;
  /** The traces as drawn (gd.data). */
  traces: Trace[];
}

type Num = number | null;
const num = (v: unknown): Num => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v
  : ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : []);

/** The trace's values before the graph format moved them onto a log2, ln
 *  or probability axis (graph/apply.ts keeps them in meta.odRaw). */
function raw(t: Trace, key: string): unknown {
  return t.meta?.odRaw?.[key] ?? t[key];
}

/** Error bar lengths below and above each mark, in data units. */
function errorsOf(t: Trace, n: number): { lo: Num[]; hi: Num[] } | null {
  const e = raw(t, "error_y") as Trace | undefined;
  if (!e || e.visible === false || (!Array.isArray(e.array) && !ArrayBuffer.isView(e.array))) return null;
  const hi = list(e.array).map(num);
  const lo = e.symmetric === false && e.arrayminus != null ? list(e.arrayminus).map(num) : hi;
  return { lo: Array.from({ length: n }, (_, i) => lo[i] ?? null), hi: Array.from({ length: n }, (_, i) => hi[i] ?? null) };
}

const drawn = (t: Trace) => t.visible !== false && t.visible !== "legendonly";

/** What a trace's notes say happens on screen but not in the file. */
export function screenNotes(traces: Trace[]): string[] {
  const out: string[] = [];
  if (traces.some((t) => t.type === "scattergl")) {
    out.push("On screen the points are drawn with WebGL (more than 5,000 in the graph); every value is in this sheet.");
  }
  if (traces.some((t) => (t.type === "box" && t.boxpoints !== "all" && list(t.y).length)
    || (t.type === "violin" && t.points !== "all" && list(t.y).length))) {
    out.push("On screen the boxes or violins draw only their outliers; every value is in this sheet.");
  }
  return out;
}

/** The rows of one panel's sheet, with the rows to set bold. */
export function panelRows(p: PanelInput): { rows: XlsxCell[][]; bold: number[]; skipped: string[] } {
  const rows: XlsxCell[][] = [];
  const bold: number[] = [];
  const skipped: string[] = [];
  const head = (cells: XlsxCell[]) => { bold.push(rows.length); rows.push(cells); };
  const dsName = (t: Trace, ds: number | undefined) => (ds !== undefined && p.datasets[ds]) || t.name || "";
  const category = (x: unknown): XlsxCell => {
    if (typeof x === "string") return x;
    if (typeof x !== "number" || !p.xTicks) return null;
    let best = -1;
    p.xTicks.vals.forEach((v, i) => {
      if (Math.abs(v - x) <= 0.5 && (best < 0 || Math.abs(v - x) < Math.abs(p.xTicks!.vals[best] - x))) best = i;
    });
    return best >= 0 ? p.xTicks.text[best] ?? null : null;
  };
  const rowName = (r: number | undefined): XlsxCell => (r === undefined ? null
    : p.rowTitles[r]?.trim() || r + 1);

  head([`Panel ${p.letter}: “${p.graph}”`]);
  rows.push(["Data table", p.data]);
  if (p.legend) rows.push(["Legend", p.legend]);
  rows.push(["Test", p.test ?? "No analysis is bound to this graph."]);
  if (p.errors) rows.push(["Centre and error bars", `${p.errors.centre} with ${p.errors.error}`]);
  for (const note of screenNotes(p.traces)) rows.push(["Note", note]);

  const tagged = p.traces.filter(drawn).map((t) => ({ t, tag: traceTag(t) }));
  const errLo = p.errors ? `${p.errors.error} below` : "Error below";
  const errHi = p.errors ? `${p.errors.error} above` : "Error above";
  const xHead = p.categorical ? "Category" : p.xTitle ? `X: ${p.xTitle}` : "X";
  const yHead = p.yTitle ? `Y: ${p.yTitle}` : "Y";

  // ---- points: every plotted value
  const pointRows: XlsxCell[][] = [];
  const counted = new Map<string, number>();
  const count = (name: string, k: number) => counted.set(name, (counted.get(name) ?? 0) + k);
  for (const { t, tag } of tagged) {
    const role = tag?.role;
    const isBox = t.type === "box" || t.type === "violin";
    if (!(role === "points" || role === "replicate" || role === "outliers" || role === "line"
      || (isBox && (role === "box" || role === "violin")))) continue;
    const name = dsName(t, tag?.ds);
    const xs = list(raw(t, "x"));
    let ys = list(raw(t, "y"));
    let rowsOf = tag?.rows;
    // a box drawn from given quartiles carries its values as one sample
    if (isBox && ys.some((s) => Array.isArray(s) || ArrayBuffer.isView(s))) ys = ys.flatMap((s) => list(s));
    if (isBox && rowsOf && rowsOf.length !== ys.length) rowsOf = undefined;
    const err = isBox ? null : errorsOf(t, ys.length);
    let k = 0;
    ys.forEach((yv, i) => {
      const y = num(yv);
      if (y === null) return;
      k++;
      const xv = isBox && xs.length === 1 ? xs[0] : xs[i];
      const what = role === "outliers" ? "Outlier" : role === "replicate" ? "Replicate value"
        : role === "line" ? "Line" : "Value";
      pointRows.push([name, what, rowName(rowsOf?.[i]), p.categorical ? category(xv) : num(xv), y,
        err ? err.lo[i] : null, err ? err.hi[i] : null]);
    });
    if (role === "points" || isBox) count(name, k);
  }

  // ---- centre and error bars of each group (bars, summary marks)
  const summaryRows: XlsxCell[][] = [];
  for (const { t, tag } of tagged) {
    if (tag?.role !== "summary" && tag?.role !== "bar") continue;
    if (t.type === "box" || t.type === "violin") continue;
    const name = dsName(t, tag.ds);
    const xs = list(raw(t, "x"));
    const ys = list(raw(t, "y"));
    const err = errorsOf(t, ys.length);
    ys.forEach((yv, i) => {
      const y = num(yv);
      if (y === null) return;
      const n = ys.length === 1 ? (counted.get(name) ?? p.groupN[name] ?? null) : null;
      summaryRows.push([name, p.categorical ? category(xs[i]) : num(xs[i]), y,
        err ? err.lo[i] : null, err ? err.hi[i] : null, n]);
    });
  }

  // ---- boxes drawn from given statistics
  const boxRows: XlsxCell[][] = [];
  for (const { t, tag } of tagged) {
    if (t.type !== "box" || !Array.isArray(raw(t, "q1"))) continue;
    const name = dsName(t, tag?.ds);
    const at = (k: string, i: number) => num(list(raw(t, k))[i]);
    list(raw(t, "q1")).forEach((_, i) => {
      boxRows.push([name, at("lowerfence", i), at("q1", i), at("median", i), at("q3", i), at("upperfence", i),
        counted.get(name) ?? p.groupN[name] ?? null]);
    });
  }

  // ---- curves and bands
  const curveRows: XlsxCell[][] = [];
  for (const { t, tag } of tagged) {
    if (tag?.role !== "fit" && tag?.role !== "band") continue;
    const name = dsName(t, tag.ds);
    const xs = list(raw(t, "x"));
    const what = tag.role === "fit" ? "Curve" : `Band${t.name ? ` (${t.name})` : ""}`;
    list(raw(t, "y")).forEach((yv, i) => {
      const y = num(yv);
      const x = num(xs[i]);
      if (y !== null && x !== null) curveRows.push([name, what, x, y]);
    });
  }

  // ---- other drawn marks: untagged traces, pies, heat maps
  const otherRows: XlsxCell[][] = [];
  for (const { t, tag } of tagged) {
    if (tag) continue;
    if (t.type === "pie") {
      const labels = list(t.labels);
      list(t.values).forEach((v, i) => otherRows.push([t.name ?? "Pie", String(labels[i] ?? i + 1), null, num(v)]));
    } else if (t.type === "heatmap") {
      const xs = list(t.x);
      const ys = list(t.y);
      list(t.z).forEach((row, i) => list(row).forEach((v, j) =>
        otherRows.push([t.name ?? "Heat map", `${String(ys[i] ?? i + 1)} × ${String(xs[j] ?? j + 1)}`, null, num(v)])));
    } else if ((t.type === undefined || t.type === "scatter" || t.type === "scattergl" || t.type === "bar")
      && list(t.y).length) {
      const xs = list(raw(t, "x"));
      list(raw(t, "y")).forEach((yv, i) => {
        const y = num(yv);
        if (y !== null) {
          otherRows.push([t.name ?? "", null, p.categorical ? category(xs[i]) : num(xs[i]), y]);
        }
      });
    } else if (t.type) {
      skipped.push(`a ${t.type} trace${t.name ? ` (“${t.name}”)` : ""}`);
    }
  }
  // tagged traces the sections above do not read (decorations aside)
  for (const { tag } of tagged) {
    if (!tag || tag.role === "decor") continue;
    if (["points", "replicate", "outliers", "line", "summary", "bar", "fit", "band", "box", "violin"]
      .includes(tag.role)) continue;
    skipped.push(`a ${tag.role} trace`);
  }

  const section = (title: string, header: XlsxCell[], body: XlsxCell[][]) => {
    if (!body.length) return;
    rows.push([]);
    head([title]);
    head(header);
    rows.push(...body);
  };
  section("Centre and error bars of each group",
    ["Data set", xHead, p.errors?.centre ?? "Centre", errLo, errHi, "n"], summaryRows);
  section("Boxes", ["Data set", "Lower whisker", "Q1", "Median", "Q3", "Upper whisker", "n"], boxRows);
  section("Plotted values", ["Data set", "Mark", "Row", xHead, yHead, errLo, errHi], pointRows);
  section("Drawn curve", ["Data set", "Line", p.categorical ? "X" : xHead, yHead], curveRows);
  section("Other drawn values", ["Trace", "Label", xHead, "Value"], otherRows);
  if (skipped.length) {
    rows.push([]);
    rows.push(["Not written", `This panel also draws ${skipped.join(", ")}, which this sheet does not list.`]);
  }
  return { rows, bold, skipped };
}

export interface SourceDataInput {
  layout: string;
  app: string;
  date: string;
  panels: PanelInput[];
  /** Panels that hold no data, and why ("a picture of “X”, unlinked
   *  from its data"). */
  without: { letter: string; why: string }[];
}

/** Nature's limit for a source data file (Nature, "Source data" in the
 *  formatting guide). */
export const NATURE_LIMIT_BYTES = 30 * 1024 * 1024;

/** The layout's source data workbook: README, then one sheet per panel
 *  named by its letter. */
export function sourceDataWorkbook(s: SourceDataInput): { bytes: Uint8Array; sheets: string[]; overNature: boolean } {
  const names = sheetNames(s.panels.map((p) => p.letter), ["README"]);
  const sheets: XlsxSheet[] = s.panels.map((p, i) => {
    const r = panelRows(p);
    return { name: names[i].name, rows: r.rows, bold: r.bold };
  });
  const readme: XlsxCell[][] = [
    [`Source data of “${s.layout}”`],
    [`Made ${s.date.slice(0, 16).replace("T", " ")} UTC with ${s.app}.`],
    [],
    ["Sheet", "Graph", "Data table"],
    ...s.panels.map((p, i): XlsxCell[] => [names[i].name, p.graph, p.data]),
    ...s.without.map((w): XlsxCell[] => [w.letter, `No source data: ${w.why}.`, null]),
    [],
    ["How values are written"],
    ["Each panel's sheet holds the values its graph draws, at full precision: every point, the centre and error bars of each group with n, and the drawn curve, read from the graph itself."],
    ["Error bars are lengths below and above the centre, in the units of the data."],
    ["On a category axis the Category column names the group under each mark; points are not given the sideways spread they are drawn with."],
    ["eLife asks for the source data behind each figure panel; Nature for files of up to 30 MB."],
  ];
  const bytes = writeXlsx([{ name: "README", rows: readme, bold: [0, 3, readme.length - 5] }, ...sheets],
    { title: `Source data of ${s.layout}`, created: s.date.replace(/\.\d+Z$/, "Z") });
  return { bytes, sheets: names.map((n) => n.name), overNature: bytes.length > NATURE_LIMIT_BYTES };
}
