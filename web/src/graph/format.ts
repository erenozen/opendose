// The graph-format schema: everything the Format Graph, Format Axes,
// legend/font and annotation dialogs can change, stored sparsely in
// GraphSettings.format. An absent field means "as the plot draws it", so
// `{}` (or no `format` at all) leaves every graph exactly as before.
//
// Plain data + pure functions only (no React, no DOM, no Plotly), so the
// layer is unit-testable with `node --test` and reusable by every plot.

/** Plotly marker symbols offered in the dialog (filled shapes; a hollow
 *  look is a fill opacity of 0 with a border). */
export const SYMBOL_SHAPES: { id: string; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "square", label: "Square" },
  { id: "diamond", label: "Diamond" },
  { id: "triangle-up", label: "Triangle up" },
  { id: "triangle-down", label: "Triangle down" },
  { id: "triangle-left", label: "Triangle left" },
  { id: "triangle-right", label: "Triangle right" },
  { id: "star", label: "Star" },
  { id: "hexagon", label: "Hexagon" },
  { id: "pentagon", label: "Pentagon" },
  { id: "cross", label: "Plus" },
  { id: "x", label: "Cross (x)" },
  { id: "line-ew", label: "Horizontal dash" },
];

export type LineDash = "solid" | "dash" | "dot" | "dashdot" | "longdash";
export const LINE_DASHES: LineDash[] = ["solid", "dash", "dot", "dashdot", "longdash"];

/** How points of one dataset are joined (the fitted curve is separate). */
export type ConnectLine = "none" | "linear" | "spline" | "hv";

/** Bar fill patterns (Plotly pattern shapes; "" = solid). */
export const BAR_PATTERNS = ["", "/", "\\", "x", "-", "|", "+", "."] as const;
export type BarPattern = (typeof BAR_PATTERNS)[number];

/** Per-dataset appearance. Every field is optional: unset = automatic. */
export interface DatasetFormat {
  /** false hides the dataset on this graph (the analysis still uses it). */
  show?: boolean;
  /** Legend text for the dataset. */
  legend?: string;
  symbol?: string;
  /** Marker size in px. */
  size?: number;
  /** Base colour (#rrggbb). Replaces the scheme colour wherever it is used. */
  color?: string;
  /** Opacity of marker / bar / box fills, 0..1 (semitransparent colours). */
  fillAlpha?: number;
  borderColor?: string;
  borderWidth?: number;
  /** Fitted curve, connecting line, survival line. */
  lineDash?: LineDash;
  lineWidth?: number;
  /** Connecting line through the points (XY-type plots). */
  connect?: ConnectLine;
  errorDir?: "both" | "up" | "down" | "none";
  /** Cap width in px (0 = no caps). */
  errorCap?: number;
  errorWidth?: number;
  /** Shaded band instead of bars. */
  errorStyle?: "bars" | "envelope";
  /** Index of another dataset whose values are this one's X error (SD);
   *  that dataset is then hidden. */
  xErrorFrom?: number | null;
  /** Shift along X (data units; category units on column graphs). */
  nudge?: number;
  pattern?: BarPattern;
  /** Plot on the right Y axis. */
  rightAxis?: boolean;
  /** Label each point with its row title. */
  labelPoints?: boolean;
}

export type ScaleKind = "linear" | "log10" | "log2" | "ln" | "probability";
export type NumberFormat =
  | "auto" | "decimal" | "scientific" | "power10" | "antilog" | "elapsed" | "date";

export interface ExtraTick {
  value: number;
  label: string;
  /** Also draw a grid line across the plot. */
  grid?: boolean;
}

export interface AxisFormat {
  hide?: boolean;
  /** Manual range ends; null/absent = automatic. */
  min?: number | null;
  max?: number | null;
  scale?: ScaleKind;
  numbers?: NumberFormat;
  /** Digits after the decimal point (decimal / scientific). */
  decimals?: number | null;
  /** Distance between major ticks (decades on a log axis). */
  majorStep?: number | null;
  /** Minor ticks per major interval (0 = none). */
  minorCount?: number;
  ticks?: "out" | "in" | "none";
  tickLen?: number;
  grid?: boolean;
  minorGrid?: boolean;
  extraTicks?: ExtraTick[];
  /** Discontinuous axis: leave out the range between `from` and `to`. */
  gap?: { from: number; to: number } | null;
  /** Elapsed-time numbering: the unit the values are in. */
  elapsedUnit?: "s" | "min" | "h";
  /** Date numbering (d3 time format, e.g. "%b %d"). */
  dateFormat?: string;
  /** Title (right Y axis only; X and Y titles live in settings.titles). */
  title?: string;
  titleSize?: number;
}

export type LegendPosition =
  | "auto" | "top" | "top-left" | "top-right" | "bottom-left" | "bottom-right"
  | "right" | "bottom";

export interface LegendFormat {
  show?: "auto" | "show" | "hide";
  position?: LegendPosition;
  orientation?: "auto" | "h" | "v";
}

export type FontFamily = "inter" | "system" | "arial" | "serif" | "mono";

export interface FontFormat {
  family?: FontFamily;
  /** Base size (everything not set below). */
  size?: number;
  titleSize?: number;
  axisTitleSize?: number;
  tickSize?: number;
  legendSize?: number;
}

/** Where an annotation's coordinates live: data units (they move with the
 *  axes) or the plot area as 0..1 fractions. */
export type CoordRef = "data" | "paper";

interface AnnotationBase {
  id: string;
  ref: CoordRef;
  color?: string;
}

export interface TextAnnotation extends AnnotationBase {
  kind: "text";
  text: string;
  x: number;
  y: number;
  size?: number;
  background?: string;
  border?: boolean;
  /** Draw an arrow from the text to (x, y); the text sits (ax, ay) px away. */
  arrow?: boolean;
  ax?: number;
  ay?: number;
}

export interface ShapeAnnotation extends AnnotationBase {
  kind: "line" | "arrow" | "rect" | "ellipse";
  x0: number; y0: number; x1: number; y1: number;
  width?: number;
  dash?: LineDash;
  fill?: string;
}

/** A live text block filled from the current results. */
export interface ResultsAnnotation extends AnnotationBase {
  kind: "results";
  what: ResultsBlock;
  x: number;
  y: number;
  size?: number;
  background?: string;
  border?: boolean;
}

export type ResultsBlock = "params" | "equation" | "pvalue";
export type Annotation = TextAnnotation | ShapeAnnotation | ResultsAnnotation;

export interface ComparisonsFormat {
  show: boolean;
  /** Pair keys (`pairKey`) the user unticked. New pairs show by default. */
  hidden?: string[];
  display?: "stars" | "p";
  prefix?: "P = " | "p = " | "";
  /** Only draw pairs with P below this (null/absent = all, ns included). */
  threshold?: number | null;
  style?: "bracket" | "line" | "tall";
  /** Leave out pairs that are not significant ("ns"). */
  hideNs?: boolean;
  lineWidth?: number;
  color?: string;
  textSize?: number;
}

export interface LettersFormat {
  show: boolean;
  alpha?: number;
  style?: "lower" | "upper" | "numbers";
  size?: number;
  color?: string;
  /** Letters returned by the engine's `compact_letters` handler, used while
   *  `input` still matches the comparisons (see letters.ts). */
  engine?: { input: string; letters: string[] } | null;
}

export interface AtRiskFormat {
  show: boolean;
  title?: boolean;
  censored?: boolean;
  /** Colour group rows with their curve colour (default true). */
  byGroup?: boolean;
  size?: number;
}

/** Whole-graph look. "classic": white background, black axes and bold
 *  sans-serif text, no grid, offset axes that end at the last tick, minor
 *  ticks, no legend title (theme.ts). Absent = the app's default look. */
export type GraphTheme = "default" | "classic";

export interface GraphFormat {
  theme?: GraphTheme;
  /** How P values and asterisks are written on brackets and in the legend
   *  sentence (significance.ts PStyle); absent = "graphpad". */
  pStyle?: "graphpad" | "apa" | "nejm";
  /** Keyed by dataset index ("0", "1", ...). */
  datasets?: Record<string, DatasetFormat>;
  /** Plotting order of dataset indices: first = left / drawn first (back). */
  order?: number[] | null;
  /** Column graphs: gap between columns as a fraction of a slot (0..0.9). */
  spacing?: number | null;
  /** Column graphs: join groups by their mean/median, or each subject. */
  connect?: "none" | "mean" | "median" | "spaghetti";
  identityLine?: boolean;
  centralLine?: "none" | "mean" | "median";
  x?: AxisFormat;
  y?: AxisFormat;
  y2?: AxisFormat;
  frame?: "auto" | "axes" | "box" | "offset" | "none";
  origin?: "auto" | "zero";
  legend?: LegendFormat;
  font?: FontFormat;
  title?: string;
  annotations?: Annotation[];
  comparisons?: ComparisonsFormat | null;
  letters?: LettersFormat | null;
  atRisk?: AtRiskFormat | null;
}

/** The empty format (stable identity: safe as a React default prop). */
export const EMPTY_FORMAT: GraphFormat = Object.freeze({}) as GraphFormat;

// ----------------------------------------------------------- normalizing
// Files are untrusted: keep only well-typed fields, clamp numbers.

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, lo = -Infinity, hi = Infinity): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;
const numOrNull = (v: unknown): number | null | undefined =>
  v === null ? null : num(v);
const str = (v: unknown, max = 2000): string | undefined =>
  typeof v === "string" ? v.slice(0, max) : undefined;
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
function oneOf<T extends string>(v: unknown, opts: readonly T[]): T | undefined {
  return typeof v === "string" && (opts as readonly string[]).includes(v) ? v as T : undefined;
}
const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (v: unknown): string | undefined =>
  typeof v === "string" && HEX.test(v) ? v.toLowerCase() : undefined;

/** Drop undefined fields so stored formats stay sparse. */
function compact<T extends object>(o: T): T {
  const out: Raw = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

function datasetFormat(r: Raw): DatasetFormat {
  return compact({
    show: bool(r.show),
    legend: str(r.legend, 200),
    symbol: SYMBOL_SHAPES.some((s) => s.id === r.symbol) ? r.symbol as string : undefined,
    size: num(r.size, 1, 40),
    color: color(r.color),
    fillAlpha: num(r.fillAlpha, 0, 1),
    borderColor: color(r.borderColor),
    borderWidth: num(r.borderWidth, 0, 10),
    lineDash: oneOf(r.lineDash, LINE_DASHES),
    lineWidth: num(r.lineWidth, 0, 12),
    connect: oneOf(r.connect, ["none", "linear", "spline", "hv"] as const),
    errorDir: oneOf(r.errorDir, ["both", "up", "down", "none"] as const),
    errorCap: num(r.errorCap, 0, 40),
    errorWidth: num(r.errorWidth, 0, 10),
    errorStyle: oneOf(r.errorStyle, ["bars", "envelope"] as const),
    xErrorFrom: r.xErrorFrom === null ? null : num(r.xErrorFrom, 0, 1e4),
    nudge: num(r.nudge, -1e9, 1e9),
    pattern: oneOf(r.pattern, BAR_PATTERNS),
    rightAxis: bool(r.rightAxis),
    labelPoints: bool(r.labelPoints),
  });
}

function axisFormat(r: Raw): AxisFormat {
  const gap = isObj(r.gap) && num(r.gap.from) !== undefined && num(r.gap.to) !== undefined
    ? { from: num(r.gap.from)!, to: num(r.gap.to)! } : r.gap === null ? null : undefined;
  return compact({
    hide: bool(r.hide),
    min: numOrNull(r.min),
    max: numOrNull(r.max),
    scale: oneOf(r.scale, ["linear", "log10", "log2", "ln", "probability"] as const),
    numbers: oneOf(r.numbers, ["auto", "decimal", "scientific", "power10", "antilog",
      "elapsed", "date"] as const),
    decimals: r.decimals === null ? null : num(r.decimals, 0, 10),
    majorStep: r.majorStep === null ? null : num(r.majorStep, 1e-300, 1e300),
    minorCount: num(r.minorCount, 0, 20),
    ticks: oneOf(r.ticks, ["out", "in", "none"] as const),
    tickLen: num(r.tickLen, 0, 30),
    grid: bool(r.grid),
    minorGrid: bool(r.minorGrid),
    extraTicks: Array.isArray(r.extraTicks)
      ? r.extraTicks.filter(isObj).filter((t) => num(t.value) !== undefined).slice(0, 50)
        .map((t) => compact({ value: num(t.value)!, label: str(t.label, 100) ?? "",
          grid: bool(t.grid) }))
      : undefined,
    gap,
    elapsedUnit: oneOf(r.elapsedUnit, ["s", "min", "h"] as const),
    dateFormat: str(r.dateFormat, 40),
    title: str(r.title, 300),
    titleSize: num(r.titleSize, 4, 72),
  });
}

function annotation(r: Raw): Annotation | null {
  const id = str(r.id, 60);
  if (!id) return null;
  const ref = oneOf(r.ref, ["data", "paper"] as const) ?? "paper";
  const base = { id, ref, color: color(r.color) };
  if (r.kind === "text" || r.kind === "results") {
    const x = num(r.x), y = num(r.y);
    if (x === undefined || y === undefined) return null;
    const common = { ...base, x, y, size: num(r.size, 4, 72),
      background: color(r.background), border: bool(r.border) };
    if (r.kind === "results") {
      const what = oneOf(r.what, ["params", "equation", "pvalue"] as const);
      return what ? compact({ ...common, kind: "results" as const, what }) : null;
    }
    return compact({ ...common, kind: "text" as const, text: str(r.text, 2000) ?? "",
      arrow: bool(r.arrow), ax: num(r.ax, -2000, 2000), ay: num(r.ay, -2000, 2000) });
  }
  const kind = oneOf(r.kind, ["line", "arrow", "rect", "ellipse"] as const);
  const x0 = num(r.x0), y0 = num(r.y0), x1 = num(r.x1), y1 = num(r.y1);
  if (!kind || x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined) {
    return null;
  }
  return compact({ ...base, kind, x0, y0, x1, y1, width: num(r.width, 0, 20),
    dash: oneOf(r.dash, LINE_DASHES), fill: color(r.fill) });
}

/** Validate a stored format (from a file, autosave or an old version). */
export function normalizeFormat(raw: unknown): GraphFormat {
  if (!isObj(raw)) return {};
  const ds: Record<string, DatasetFormat> = {};
  if (isObj(raw.datasets)) {
    for (const [k, v] of Object.entries(raw.datasets)) {
      if (/^\d{1,4}$/.test(k) && isObj(v)) {
        const f = datasetFormat(v);
        if (Object.keys(f).length) ds[k] = f;
      }
    }
  }
  const axis = (v: unknown) => {
    if (!isObj(v)) return undefined;
    const a = axisFormat(v);
    return Object.keys(a).length ? a : undefined;
  };
  const c = raw.comparisons;
  const cmp = isObj(c) ? compact({
    show: c.show !== false,
    hidden: Array.isArray(c.hidden)
      ? c.hidden.filter((h): h is string => typeof h === "string") : undefined,
    display: oneOf(c.display, ["stars", "p"] as const),
    prefix: oneOf(c.prefix, ["P = ", "p = ", ""] as const),
    threshold: c.threshold === null ? null : num(c.threshold, 0, 1),
    style: oneOf(c.style, ["bracket", "line", "tall"] as const),
    hideNs: bool(c.hideNs),
    lineWidth: num(c.lineWidth, 0.25, 8),
    color: color(c.color),
    textSize: num(c.textSize, 4, 48),
  }) : undefined;
  const l = raw.letters;
  const letters = isObj(l) ? compact({
    show: l.show !== false,
    alpha: num(l.alpha, 1e-6, 0.5),
    style: oneOf(l.style, ["lower", "upper", "numbers"] as const),
    size: num(l.size, 4, 48),
    color: color(l.color),
    engine: isObj(l.engine) && typeof l.engine.input === "string"
      && Array.isArray(l.engine.letters)
      ? { input: l.engine.input, letters: l.engine.letters.map((x) => String(x)) }
      : undefined,
  }) : undefined;
  const r = raw.atRisk;
  const risk = isObj(r) ? compact({
    show: r.show !== false,
    title: bool(r.title),
    censored: bool(r.censored),
    byGroup: bool(r.byGroup),
    size: num(r.size, 4, 36),
  }) : undefined;
  const lg = raw.legend;
  const legend = isObj(lg) ? compact({
    show: oneOf(lg.show, ["auto", "show", "hide"] as const),
    position: oneOf(lg.position, ["auto", "top", "top-left", "top-right",
      "bottom-left", "bottom-right", "right", "bottom"] as const),
    orientation: oneOf(lg.orientation, ["auto", "h", "v"] as const),
  }) : undefined;
  const ft = raw.font;
  const font = isObj(ft) ? compact({
    family: oneOf(ft.family, ["inter", "system", "arial", "serif", "mono"] as const),
    size: num(ft.size, 4, 72),
    titleSize: num(ft.titleSize, 4, 72),
    axisTitleSize: num(ft.axisTitleSize, 4, 72),
    tickSize: num(ft.tickSize, 4, 72),
    legendSize: num(ft.legendSize, 4, 72),
  }) : undefined;
  const theme = oneOf(raw.theme, ["default", "classic"] as const);
  return compact({
    theme: theme === "classic" ? theme : undefined,
    pStyle: oneOf(raw.pStyle, ["apa", "nejm"] as const),
    datasets: Object.keys(ds).length ? ds : undefined,
    order: Array.isArray(raw.order)
      ? raw.order.filter((v): v is number => Number.isInteger(v) && (v as number) >= 0)
      : undefined,
    spacing: num(raw.spacing, 0, 0.9),
    connect: oneOf(raw.connect, ["none", "mean", "median", "spaghetti"] as const),
    identityLine: bool(raw.identityLine),
    centralLine: oneOf(raw.centralLine, ["none", "mean", "median"] as const),
    x: axis(raw.x),
    y: axis(raw.y),
    y2: axis(raw.y2),
    frame: oneOf(raw.frame, ["auto", "axes", "box", "offset", "none"] as const),
    origin: oneOf(raw.origin, ["auto", "zero"] as const),
    legend: legend && Object.keys(legend).length ? legend : undefined,
    font: font && Object.keys(font).length ? font : undefined,
    title: str(raw.title, 300),
    annotations: Array.isArray(raw.annotations)
      ? raw.annotations.filter(isObj).map(annotation)
        .filter((a): a is Annotation => a !== null).slice(0, 200)
      : undefined,
    comparisons: cmp,
    letters,
    atRisk: risk,
  });
}

/** The format stored on a graph sheet's settings (validated). */
export function readFormat(settings: { format?: unknown } | null | undefined): GraphFormat {
  return normalizeFormat(settings?.format);
}

/** Format of dataset `i` (empty object when nothing is set). */
export function datasetFmt(f: GraphFormat, i: number): DatasetFormat {
  return f.datasets?.[String(i)] ?? {};
}

/** Merge a patch into several datasets' formats at once: the dialog's
 *  "apply to this one / selected / all". Fields set to undefined in the
 *  patch are removed (back to automatic). */
export function withDatasetFormat(f: GraphFormat, indices: number[],
  patch: DatasetFormat): GraphFormat {
  const datasets = { ...(f.datasets ?? {}) };
  for (const i of indices) {
    const merged: Raw = { ...(datasets[String(i)] ?? {}), ...patch };
    for (const [k, v] of Object.entries(merged)) if (v === undefined) delete merged[k];
    if (Object.keys(merged).length) datasets[String(i)] = merged as DatasetFormat;
    else delete datasets[String(i)];
  }
  return compact({ ...f, datasets: Object.keys(datasets).length ? datasets : undefined });
}

/** Return `f` with top-level `key` replaced; undefined/empty removes it. */
export function withField<K extends keyof GraphFormat>(f: GraphFormat, key: K,
  value: GraphFormat[K] | undefined): GraphFormat {
  const out = { ...f };
  const empty = value === undefined
    || (isObj(value) && Object.keys(compact(value)).length === 0);
  if (empty) delete out[key];
  else out[key] = value;
  return out;
}

/** True when the format changes nothing (the graph draws as built). */
export function isDefaultFormat(f: GraphFormat): boolean {
  return Object.keys(compact(f)).length === 0;
}

/** Which Format Graph controls a graph kind offers (GraphKindDef.formatFeatures).
 *  Axes, legend, fonts and annotations apply to every graph. */
export interface FormatFeatures {
  /** Groups sit on a category axis, dataset i at x = i (column graphs):
   *  plotting order moves positions; spacing, joining columns and
   *  comparison brackets / letters apply. */
  categorical?: boolean;
  /** Markers: symbol, size, fill, border; row-title labels. */
  points?: boolean;
  /** A line per dataset (fitted curve, survival curve): dash, width. */
  lines?: boolean;
  /** Connecting line through each dataset's points. */
  connect?: boolean;
  errorBars?: boolean;
  /** X error taken from another dataset. */
  xError?: boolean;
  bars?: boolean;
  boxes?: boolean;
  /** Number-at-risk table. */
  survival?: boolean;
  /** Colour and fill opacity per data set even without points, bars or
   *  boxes (pie and donut slices, where a "data set" is one part). */
  color?: boolean;
  /** No numeric X/Y axes (pie and donut charts, heat maps): no Format
   *  axes, no nudging, right axis or reference lines; annotations are
   *  placed in plot-area coordinates. */
  noAxes?: boolean;
  /** Nothing per data set applies (heat maps, forest plots, volcano
   *  plots): the Format graph dialog shows only its whole-graph part. */
  noDatasets?: boolean;
  /** X is a category axis although data sets do not sit at x = i
   *  (grouped graphs): Format axes hides the numeric X settings. */
  categoryX?: boolean;
}

export const DEFAULT_FEATURES: FormatFeatures = {
  points: true, lines: true, connect: true, errorBars: true, xError: true,
};

/** A new annotation id, unique within the list. */
export function newAnnotationId(existing: { id: string }[]): string {
  const ids = new Set(existing.map((a) => a.id));
  let n = existing.length + 1;
  while (ids.has(`a${n}`)) n++;
  return `a${n}`;
}
