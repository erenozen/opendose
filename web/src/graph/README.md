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
when `groupX` places them.

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
- Date numbering sets Plotly's date axis and format; tables keep dates as
  text until the date-parsing work lands, so it applies once X values
  arrive as dates. Elapsed-time numbering works on numeric X (in s, min
  or h).
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
