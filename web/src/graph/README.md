# Graph formatting layer

Everything the Format Graph, Format Axes, legend/font, annotation and
pairwise-comparison dialogs can change lives in one sparse, validated
object, `GraphFormat`, stored on the graph sheet as `settings.format`.
A plot panel builds its Plotly traces and layout exactly as before, then
passes them through one pure function:

```ts
applyFormat(traces, layout, format, ctx) -> { traces, layout }
```

With an empty format (`{}`, or no `format` at all) it returns its inputs
untouched (same objects), so unformatted graphs render pixel for pixel as
they did before the layer existed.

```
graph/
  format.ts       GraphFormat schema, normalizeFormat/readFormat, helpers
  apply.ts        applyFormat, tagTrace, FormatContext (pure)
  axes.ts         scales (log10 native; log2/ln/probability transformed),
                  tick generation, number formats (pure)
  significance.ts P summaries, bracket stacking, compact letters (pure)
  results.ts      comparisons / text blocks / risk sets from results (pure)
  edits.ts        annotation drags -> format; Plotly config (pure)
  usePlotEdits.ts React glue for dragging
  FormattedPlot.tsx  a Plotly div that does all of the above for panels
                  that build traces / layout declaratively (useMemo)
  useDarkMode.ts  the colour theme as React state
  theme.ts        GraphFormat.theme "classic" (pure)
  swarm.ts        point placement: jitter, beeswarm, symmetric (pure)
  cvd.ts          colour-vision simulation, CIEDE2000 / CIE76 (pure)
  legend.ts       legendSentence: error-bar meaning, n, star scale (pure)
  usePlotArea.ts  the drawn plot area in px (for beeswarm / symmetric)
  FigurePanel.tsx Settings → Figure style: theme, P style, CVD check
  GraphCaption.tsx, FigureLegendCard.tsx  the legend sentence on screen
  *Dialog.tsx     the dialogs; useFormatDialogs.tsx wires them to a card
  __tests__/      node --test unit tests (npm run test:unit)
```

## Adopting it in a plot panel (three lines)

The shell already passes `format` and `onFormatChange` in `PlotProps`.
In the panel's render effect:

```ts
traces.push(tagTrace({ ...trace }, { ds: i, role: "points", rows }));   // 1. tag
const out = applyFormat(traces, layout, format ?? EMPTY_FORMAT, {          // 2. apply
  dark, scheme, datasets: names, categorical: true, comparisons, results });
Plotly.react(div, out.traces, out.layout, plotConfig(config, format, !!onFormatChange))
  .then(() => attach(div));                                                // 3. render
```

where `const { rev, attach } = usePlotEdits(format, onFormatChange)` and
`editRevision: rev` goes into the context (both only matter for dragging
annotations; skip them and annotations still draw, just not draggable).
Declare which dataset controls the dialog shows with
`formatFeatures` on the graph kind (`GraphKindDef`), e.g.
`{ categorical: true, points: true, bars: true, errorBars: true }`.
Every graph kind sets it. Besides the dataset controls there are:

| feature      | effect |
|--------------|--------|
| `color`      | a Colour / fill opacity section without symbols or bars (pie slices, ROC and scree lines) |
| `noAxes`     | no Format axes, nudging, right axis or reference lines; annotations in plot-area units (pie, donut, heat maps) |
| `noDatasets` | Format graph shows only its whole-graph part (heat maps, forest and volcano plots, loadings) |
| `categoryX`  | X is a category axis though data set i is not at x = i (grouped, nested, stacked parts): no numeric X settings |

Most panels now render `FormattedPlot` instead of driving Plotly:

```tsx
const fig = useMemo(() => ({ traces, layout }), [...]);           // tagged traces
const ctx = useMemo(() => ({ dark, scheme, datasets: names }), [...]);
return <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
  onFormatChange={onFormatChange} ctx={ctx} filename="nested" />;
```

When Format graph's "data sets" are not the table's data sets (the parts
of a pie, the levels of a colour-by variable, the rows of a grouped graph
clustered by data set), the graph kind's `formatDatasets(table, graph,
options)` returns them, in the same order as the plot's `ds` tags. A
graph kind whose comparisons are not one group per data set provides
`comparisons(result, table, options)` (grouped and nested graphs); the
dialog lists them and the plot places them with `groupX`.

## Tagging traces

`tagTrace(trace, { ds, role, rows?, keys? })` stores the tag in the
trace's `meta` (Plotly ignores it when drawing).

| role       | what it is                         | what formatting reaches it |
|------------|------------------------------------|----------------------------|
| `points`   | markers (values or means)          | symbol, size, fill, border, connect line, labels, error bars, X error |
| `summary`  | mean/median marker over a column   | colour only |
| `fit`      | fitted curve                       | colour, dash, width |
| `line`     | data line (survival curve)         | colour, dash, width |
| `band`     | filled CI / prediction band        | colour, fill opacity |
| `bar` / `box` / `violin` | column shapes        | fill, border, pattern, width (spacing) |
| `outliers` | flagged points                     | colour |
| `decor`    | anything else                      | nothing per dataset |

`ds` is the dataset index (the key in `format.datasets`). `rows` (row of
each point) enables row-title labels and X error; `keys` (an identity per
point, e.g. `"row:subcolumn"`) enables before-after (spaghetti) lines.
Colours are replaced by prefix: any colour string that starts with the
scheme colour of that dataset (`#2a78d6`, `#2a78d655`) gets the user's
colour with the same alpha suffix.

## FormatContext

```ts
interface FormatContext {
  dark: boolean; scheme: SchemeId;
  datasets: string[];          // names by index, as entered
  categorical?: boolean;       // dataset i drawn around x = i
  rowTitles?: string[];
  comparisons?: Comparison[];  // extractComparisons(result, names)?.comparisons
  results?: Partial<Record<ResultsBlock, string>>;  // resultBlocks(result)
  riskSets?: RiskSet[];        // riskSetsFromTable(table.datasets)
  groupX?: (name, family?) => number | null;  // grouped graphs: where a group sits
  editRevision?: number;
}
```

Category graphs get plotting order, hidden columns, spacing, joining
columns, brackets and letters for free when `categorical` is set and
dataset i sits at x = i. Grouped graphs (several groups per category)
should pass `groupX` so brackets and letters land on the right bar;
comparisons with a `family` (two-way, within one row) are only drawn
when `groupX` places them. `groupX` may return `{ x, xref }` for a bar
on another X axis (the second panel of the three-way graph, `"x2"`):
each axis stacks its own brackets, and a pair across two axes is not
drawn. `groupHalf` (default 0.45) is how far either side of a group the
data a bracket must clear reaches (half a bar on grouped graphs).

Colours are replaced in per-point colour arrays too (grouped bars).

## Coordinates

Shapes and annotations are placed in Plotly "axis units": data values on
linear axes, log10(value) on a native log axis, transformed values on
log2/ln/probability axes. `axisMaps(format)` gives the `to`/`from` maps;
user annotations store data values (or 0-1 plot-area fractions) and are
converted on the way in and out.

## Implemented vs limited

- Scales: linear, log10 (Plotly native), log2 and ln (data transformed,
  ticks generated; on a Y axis the hover shows the original values),
  probability (normal-quantile axis for percentages).
- Discontinuous axis: left Y axis only, drawn as two stacked subplots
  sharing X, with break marks and one rotated title. Not combined with
  the right Y axis or offset frames.
- Date numbering sets Plotly's date axis and format. Tables with dates as
  X are read as numbers (days since the earliest date, project/xformat.ts)
  and the XY graph labels its own ticks with the dates, so this numbering
  only applies to X values that already are calendar dates; it has no
  such source yet. Elapsed-time numbering works on numeric X (in s, min
  or h).
- Pie and donut charts: per-part colour, fill opacity, legend
  text, show / hide and order are read by the pie itself (one trace per
  chart); stacked parts use the bar tags.
- Horizontal (X) error bars take the SD from another dataset of the same
  table (that dataset is hidden from the graph). The table model has no X
  error subcolumns.
- Tick direction: outward, inward or none (Plotly has no crossing ticks).
- Origin: automatic or lines through zero; "axes cross at a value" needs
  a fixed range and is not offered.
- Legends: one legend per graph; "combined vs separate" legends are not
  offered.
- Compact letters: the dialog asks the engine's `compact_letters`
  handler (payload `{groups, comparisons:[{a,b,p,significant}], alpha}`)
  and caches the answer in the format; until it exists, or when the input
  changes, the in-browser insert-and-absorb implementation is used.
- Number at risk: computed from the survival table (exact); falls back to
  the Kaplan-Meier result's step counts when no table is given.

## Figure conventions

What journals ask of a figure, built on the layer above.

### `legendSentence(graph, table, result?)` (legend.ts)

```ts
legendSentence(graph: Pick<GraphSheet, "graphType" | "settings">,
  table: DataTableModel, result?: unknown): string
```

The figure-legend sentence of a graph sheet, e.g. "Mean ± SD (bars), with
individual values. n = 6 (Control), 5 (Drug). ns, P > 0.05; * P ≤ 0.05;
** P ≤ 0.01; *** P ≤ 0.001; **** P ≤ 0.0001." Contract:

- `table` is what the graph plots (exclusions blanked; a frozen graph's
  snapshot table); `result` is the bound results, if any.
- Column graphs (also on XY tables) and grouped graphs; every other kind
  returns "" (callers show nothing).
- First clause: centre and error exactly as "Mean ± SD", "Mean ± SEM",
  "Mean with 95% CI", "Median with IQR" (or "Mean with range"; entered
  summary data say what was entered), with the mark ("(bars)") and
  ", with individual values" when points are drawn. Box and violin
  graphs describe box, whiskers and line instead.
- n per group: "n = 6 per group" when equal, else "n = 6 (A), 5 (B)";
  grouped graphs count each row × data set cell.
- SuperPlot mode (sheets/common/superplot.ts): "Mean ± SD of the
  experiment means …", n counts experiments ("n = 3 experiments per
  group (54 values in all)").
- When the graph draws asterisks (format.comparisons shown as stars) the
  scale of `format.pStyle` is appended (significance.ts `starScale`).
- Deterministic and pure; `composeLegend(spec)` builds the words from a
  plain `LegendSpec` for callers that describe a graph themselves.

Where it shows: the column and grouped graphs' "Legend sentence" option
(`settings.column.caption` / `settings.grouped.caption`: "below" = an
on-screen line with Copy, not in exports; "figure" = drawn in the figure
through `FormatContext.caption`; "off"), and the Figure legend card under
the methods text of the results sheet the graph is bound to.

### Theme, P style, hide ns

- `GraphFormat.theme: "classic"` (theme.ts, applied by applyFormat after
  brackets and annotations are placed, before fonts): white background,
  black axes and text, bold Arial, no grid, outside ticks, minor ticks on
  numeric axes, legend title hidden, offset axes (`anchor: "free"`) and
  automatic linear axes snapped to 1-2-5 tick bounds (brackets kept in
  range) so each axis ends on its last tick. In the dark app theme the
  graph keeps dark paper on screen. Exports carry it (they read the div).
- `GraphFormat.pStyle: "apa" | "nejm"` (absent = GraphPad style, i.e.
  the old formatting): `formatPStyle`, `starsFor`, `starScale` in
  significance.ts; brackets, results blocks and the legend sentence use
  it. `ComparisonsFormat.hideNs` leaves out "ns" pairs.

### Point layouts (swarm.ts)

`spreadOffsets(values, "jitter" | "swarm" | "symmetric", scale)` gives
offsets in category units. Jitter is the original fixed lanes (saved
graphs keep it); new column and grouped graphs start with "symmetric"
(equal values side by side, exact Y kept). Swarm and symmetric need the
pixel scale of the drawn plot: `usePlotArea()` + `FormattedPlot`'s
`onDrawn` (or a ColumnPlot redraw) measure it; before the first draw a
typical card's size is assumed.

### Colour-vision check (cvd.ts, FigurePanel.tsx)

Reads the colours the plot actually draws (`drawnColors(gd)`), simulates
protanopia, deuteranopia and tritanopia (Machado 2009, severity 1, linear
RGB), achromatopsia and print grayscale, and flags pairs with CIEDE2000
below 5 (look the same) or 10 (similar) and marks below 3:1 contrast on
the background. It warns when transparent fills meet the colour-blind
scheme. The built-in schemes stay validated offline (lib/palette.ts).

### SuperPlots

Trace role `replicate` (new): data marks coloured by replicate, which
count for brackets and extents but get no per-dataset styling. The
replicate-mean overlay traces carry `meta.superplotMeans`. Builders live
in `sheets/common/superplotTraces.ts`; the replicate model (the table's
`replicates` map) in `sheets/common/superplot.ts`.
