// Small dialogs of the data grid: sort rows, insert a series, table
// format (summary format, X dates / times, decimal places), export, and
// convert replicates to summary values.
import { useState } from "react";
import Modal from "../../components/Modal";
import { runEngine } from "../../lib/engine";
import {
  DEFAULT_EXPORT, fileSlug, tableMatrix, toDelimited, type ExportOptions,
} from "../../project/exportTable";
import {
  allowsSummaryFormat, flatColumns, hasAnyValue, seriesValues, setDecimals,
  setSubcolumnFormat, tableShape, type SeriesSpec, type SortKey,
} from "../../project/table";
import {
  SUBCOLUMN_FORMAT_LABELS, SUBCOLUMN_FORMATS, type DataTableModel, type DateOrder,
  type SubcolumnFormat, type XFormat, type XTimeUnit,
} from "../../project/types";
import { defaultTimeUnit, localeDateOrder, TIME_UNIT_LABELS } from "../../project/xformat";
import { columnLabel, conversionTargets, convertTable } from "./convert";
import { copyText, downloadText } from "./download";

type Edit = (fn: (t: DataTableModel) => DataTableModel) => void;

const numOr = (v: string, d: number) => {
  const n = Number(v.trim().replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) ? n : d;
};

// ------------------------------------------------------------ sort

export function SortDialog({ table, initialKey, onSort, onReverse, onClose }: {
  table: DataTableModel;
  initialKey: SortKey;
  onSort: (key: SortKey, dir: "asc" | "desc") => void;
  onReverse: () => void;
  onClose: () => void;
}) {
  const shape = tableShape(table.type);
  const keys: { id: string; key: SortKey; label: string }[] = [];
  if (shape.hasX) keys.push({ id: "x", key: { kind: "x" }, label: "X values" });
  if (shape.hasRowTitles) keys.push({ id: "rt", key: { kind: "rowTitle" }, label: "Row titles" });
  table.datasets.forEach((d, i) => {
    const w = d.rows[0]?.length ?? 1;
    const summary = table.subcolumnFormat !== "replicates";
    keys.push({
      id: `d${i}`, key: { kind: "dataset", dataset: i },
      label: w > 1 ? `${d.name} (${summary ? "mean" : "mean of replicates"})` : d.name,
    });
    if (w > 1 && !summary) {
      for (let s = 0; s < w; s++) {
        keys.push({ id: `d${i}s${s}`, key: { kind: "dataset", dataset: i, sub: s },
          label: `${d.name}: ${d.subTitles?.[s] || `Y${s + 1}`}` });
      }
    }
  });
  const idOf = (k: SortKey) => k.kind === "x" ? "x" : k.kind === "rowTitle" ? "rt"
    : k.sub === undefined ? `d${k.dataset}` : `d${k.dataset}s${k.sub}`;
  const [id, setId] = useState(() => keys.find((k) => k.id === idOf(initialKey))?.id ?? keys[0]?.id);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const chosen = keys.find((k) => k.id === id);
  return (
    <Modal title="Sort rows" onClose={onClose}
      onSubmit={() => { if (chosen) onSort(chosen.key, dir); }}
      actions={
        <>
          <button type="button" className="spacer" onClick={onReverse}>Reverse row order</button>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Sort</button>
        </>
      }>
      <p className="modal-text">
        Whole rows move together, so every value stays with its X, row
        title and exclusion mark. Blank values go last.
      </p>
      <label className="field">
        <span>Sort by</span>
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {keys.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </label>
      <fieldset className="field-radios">
        <legend>Order</legend>
        <label><input type="radio" name="sort-dir" checked={dir === "asc"}
          onChange={() => setDir("asc")} /> Ascending (smallest first)</label>
        <label><input type="radio" name="sort-dir" checked={dir === "desc"}
          onChange={() => setDir("desc")} /> Descending (largest first)</label>
      </fieldset>
    </Modal>
  );
}

// ------------------------------------------------------------ series

export function SeriesDialog({ table, row, col, count, onInsert, onClose }: {
  table: DataTableModel;
  row: number;
  col: number;            // flat column
  count: number;          // default length
  onInsert: (row: number, col: number, spec: SeriesSpec) => void;
  onClose: () => void;
}) {
  const cols = flatColumns(table);
  const xIx = cols.findIndex((c) => c.kind === "x");
  const [column, setColumn] = useState(String(cols[col] ? col : Math.max(0, xIx)));
  const [start, setStart] = useState("1");
  const [step, setStep] = useState("1");
  const [kind, setKind] = useState<SeriesSpec["kind"]>("arithmetic");
  const [n, setN] = useState(String(Math.max(1, count)));
  const [first, setFirst] = useState(String(row + 1));
  const spec: SeriesSpec = {
    start: numOr(start, 1), step: numOr(step, kind === "geometric" ? 10 : 1), kind,
    count: Math.max(1, Math.min(100000, Math.round(numOr(n, 1)))),
  };
  const sample = seriesValues({ ...spec, count: Math.min(spec.count, 5) });
  return (
    <Modal title="Insert series" onClose={onClose}
      onSubmit={() => onInsert(Math.max(0, Math.round(numOr(first, 1)) - 1), Number(column), spec)}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Insert series</button>
        </>
      }>
      <div className="field-row">
        <label className="field">
          <span>Column</span>
          <select value={column} onChange={(e) => setColumn(e.target.value)}>
            {cols.map((c, i) => <option key={i} value={i}>{columnLabel(table, c)}</option>)}
          </select>
        </label>
        <label className="field field-num">
          <span>Starting at row</span>
          <input inputMode="numeric" value={first} onChange={(e) => setFirst(e.target.value)} />
        </label>
      </div>
      <fieldset className="field-radios">
        <legend>Each value is the previous one</legend>
        <label><input type="radio" name="series-kind" checked={kind === "arithmetic"}
          onChange={() => setKind("arithmetic")} /> plus an increment (arithmetic)</label>
        <label><input type="radio" name="series-kind" checked={kind === "geometric"}
          onChange={() => setKind("geometric")} /> times a factor (geometric)</label>
      </fieldset>
      <div className="field-row">
        <label className="field field-num">
          <span>First value</span>
          <input inputMode="decimal" value={start} aria-label="First value"
            onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field field-num">
          <span>{kind === "geometric" ? "Factor" : "Increment"}</span>
          <input inputMode="decimal" value={step}
            aria-label={kind === "geometric" ? "Factor" : "Increment"}
            onChange={(e) => setStep(e.target.value)} />
        </label>
        <label className="field field-num">
          <span>Number of values</span>
          <input inputMode="numeric" value={n} aria-label="Number of values"
            onChange={(e) => setN(e.target.value)} />
        </label>
      </div>
      <p className="field-note">
        {sample.join(", ")}{spec.count > 5 ? ", …" : ""}. Rows are added if needed.
      </p>
    </Modal>
  );
}

// ------------------------------------------------------------ table format

export function TableFormatDialog({ table, onApply, onConvert, onClose }: {
  table: DataTableModel;
  onApply: Edit;
  onConvert: () => void;
  onClose: () => void;
}) {
  const shape = tableShape(table.type);
  const summaryOk = allowsSummaryFormat(table.type);
  const [fmt, setFmt] = useState<SubcolumnFormat>(table.subcolumnFormat);
  const [reps, setReps] = useState(String(table.subcolumnFormat === "replicates"
    ? table.datasets[0]?.rows[0]?.length ?? 1 : 3));
  const [xFormat, setXFormat] = useState<XFormat>(table.xFormat);
  const [unit, setUnit] = useState<XTimeUnit>(table.xTimeUnit ?? defaultTimeUnit(table.xFormat));
  const [order, setOrder] = useState<DateOrder>(table.xDateOrder ?? localeDateOrder());
  const [twoPart, setTwoPart] = useState<"hm" | "ms">(table.xElapsedTwoPart ?? "hm");
  const [dec, setDec] = useState(table.decimals === undefined ? "auto" : String(table.decimals));
  const changingFmt = fmt !== table.subcolumnFormat;
  const hasData = hasAnyValue(table);

  const apply = () => {
    onApply((t) => {
      let next = t;
      if (summaryOk) {
        // column tables stack replicates down the rows: one subcolumn
        const r = t.type === "column" ? 1 : Math.max(1, Math.min(24, Math.round(numOr(reps, 1))));
        const curReps = t.datasets[0]?.rows[0]?.length ?? 1;
        if (changingFmt || (fmt === "replicates" && r !== curReps)) {
          next = setSubcolumnFormat(next, fmt, fmt === "replicates" ? r : undefined);
        }
      }
      if (shape.hasX) {
        next = { ...next, xFormat };
        if (xFormat === "numbers") {
          delete next.xTimeUnit; delete next.xDateOrder; delete next.xElapsedTwoPart;
        } else {
          next.xTimeUnit = unit;
          if (xFormat === "dates") next.xDateOrder = order; else delete next.xDateOrder;
          if (xFormat === "elapsed") next.xElapsedTwoPart = twoPart; else delete next.xElapsedTwoPart;
        }
      }
      return setDecimals(next, dec === "auto" ? undefined : Number(dec));
    });
  };

  const units: XTimeUnit[] = xFormat === "dates"
    ? ["days", "weeks", "years", "hours"] : ["seconds", "minutes", "hours", "days"];

  return (
    <Modal title="Format data table" onClose={onClose} onSubmit={apply}
      className="table-format-dialog"
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Apply</button>
        </>
      }>
      {summaryOk && (
        <>
          <label className="field">
            <span>Y values entered as</span>
            <select value={fmt} aria-label="Y values entered as"
              onChange={(e) => setFmt(e.target.value as SubcolumnFormat)}>
              {SUBCOLUMN_FORMATS.map((f) => (
                <option key={f} value={f}>{SUBCOLUMN_FORMAT_LABELS[f]}</option>
              ))}
            </select>
          </label>
          {fmt === "replicates" && table.type !== "column" && (
            <label className="field field-num">
              <span>Replicates (subcolumns)</span>
              <input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
            </label>
          )}
          {changingFmt && hasData && (
            <p className="field-note">
              Values stay where they are; only the subcolumn headings change.
              To compute means and SDs from replicates instead,{" "}
              <button type="button" className="linkish" onClick={onConvert}>
                convert into a new table
              </button>.
            </p>
          )}
        </>
      )}
      {shape.hasX && (
        <>
          <label className="field">
            <span>X values are</span>
            <select value={xFormat} aria-label="X values are"
              onChange={(e) => {
                const v = e.target.value as XFormat;
                setXFormat(v);
                setUnit(defaultTimeUnit(v));
              }}>
              <option value="numbers">Numbers</option>
              <option value="dates">Dates</option>
              <option value="elapsed">Elapsed times</option>
            </select>
          </label>
          {xFormat !== "numbers" && (
            <div className="field-row">
              <label className="field">
                <span>{xFormat === "dates" ? "Analyze as time since the earliest date, in"
                  : "Analyze in"}</span>
                <select value={unit} onChange={(e) => setUnit(e.target.value as XTimeUnit)}>
                  {units.map((u) => <option key={u} value={u}>{TIME_UNIT_LABELS[u]}</option>)}
                </select>
              </label>
              {xFormat === "dates" ? (
                <label className="field">
                  <span>Read 1/2/2024 as</span>
                  <select value={order} onChange={(e) => setOrder(e.target.value as DateOrder)}>
                    <option value="dmy">1 February (day first)</option>
                    <option value="mdy">January 2 (month first)</option>
                  </select>
                </label>
              ) : (
                <label className="field">
                  <span>Read 12:30 as</span>
                  <select value={twoPart} onChange={(e) => setTwoPart(e.target.value as "hm" | "ms")}>
                    <option value="hm">12 h 30 min (h:mm)</option>
                    <option value="ms">12 min 30 s (m:ss)</option>
                  </select>
                </label>
              )}
            </div>
          )}
          {xFormat !== "numbers" && (
            <p className="field-note">
              {xFormat === "dates"
                ? "Type dates in almost any form (2024-03-05, 5/3/2024, 5 Mar 2024); the table shows them as 2024-03-05."
                : "Type h:mm:ss (1:12:30.5), h:mm, a number of hours (1.5), or a number with a unit (90 s, 30 min, 2 d)."}
            </p>
          )}
        </>
      )}
      <label className="field">
        <span>Decimal places shown</span>
        <select value={dec} aria-label="Decimal places shown" onChange={(e) => setDec(e.target.value)}>
          <option value="auto">As typed</option>
          {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <span className="field-note">
          Display only: analyses and exports always use every digit stored.
          A cell shows all its digits while you edit it.
        </span>
      </label>
    </Modal>
  );
}

// ------------------------------------------------------------ export

export function ExportDialog({ table, name, onClose }: {
  table: DataTableModel;
  name: string;
  onClose: () => void;
}) {
  const [o, setO] = useState<ExportOptions>(DEFAULT_EXPORT);
  const [note, setNote] = useState("");
  const matrix = () => tableMatrix(table, o);
  const slug = fileSlug(name, "data");
  return (
    <Modal title="Export data table" onClose={onClose}
      onSubmit={() => { downloadText(`${slug}.csv`, toDelimited(matrix(), "csv", o.decimal), "text/csv;charset=utf-8"); onClose(); }}
      actions={
        <>
          <button type="button" className="spacer" onClick={async () => {
            const ok = await copyText(toDelimited(matrix(), "tsv"));
            setNote(ok ? "Copied as tab-separated text." : "Copy failed: the browser blocked the clipboard.");
          }}>Copy</button>
          <button type="button" onClick={() => {
            downloadText(`${slug}.txt`, toDelimited(matrix(), "tsv"), "text/tab-separated-values;charset=utf-8");
            onClose();
          }}>Download TSV</button>
          <button type="submit" className="btn-primary">Download CSV</button>
        </>
      }>
      <p className="modal-text">
        Every stored digit is exported, whatever the decimal places shown.
        CSV opens in any spreadsheet; tab-separated text pastes cleanly.
      </p>
      <fieldset className="field-radios">
        <legend>Excluded values</legend>
        <label><input type="radio" name="exp-ex" checked={o.excluded === "asterisk"}
          onChange={() => setO({ ...o, excluded: "asterisk" })} /> Followed by * (12.5*)</label>
        <label><input type="radio" name="exp-ex" checked={o.excluded === "asis"}
          onChange={() => setO({ ...o, excluded: "asis" })} /> Like any other value</label>
        <label><input type="radio" name="exp-ex" checked={o.excluded === "blank"}
          onChange={() => setO({ ...o, excluded: "blank" })} /> Left blank</label>
      </fieldset>
      <label className="field">
        <span>Decimal separator</span>
        <select value={o.decimal} onChange={(e) => setO({ ...o, decimal: e.target.value as "." | "," })}>
          <option value=".">Point (1.5); CSV columns separated by commas</option>
          <option value=",">Comma (1,5); CSV columns separated by semicolons</option>
        </select>
      </label>
      <label className="field-check">
        <input type="checkbox" checked={o.titles}
          onChange={(e) => setO({ ...o, titles: e.target.checked })} />
        Include column titles
      </label>
      {note && <p className="field-note" role="status">{note}</p>}
    </Modal>
  );
}

// ------------------------------------------------------------ convert

export function ConvertDialog({ table, name, onCreate, onClose }: {
  table: DataTableModel;
  name: string;
  onCreate: (t: DataTableModel, name: string) => void;
  onClose: () => void;
}) {
  const targets = conversionTargets(table.subcolumnFormat);
  const [target, setTarget] = useState<SubcolumnFormat>(targets[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fromReps = table.subcolumnFormat === "replicates";
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const t = await runEngine((engine) => convertTable(engine, table, target), { priority: "user" });
      onCreate(t, `${name} (${SUBCOLUMN_FORMAT_LABELS[target]})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  return (
    <Modal title="Convert to summary values" onClose={onClose} onSubmit={() => { void run(); }}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>Create table</button>
        </>
      }>
      <p className="modal-text">
        {fromReps
          ? "Each row's replicates become their mean and error in a new data table; this table stays as it is. Excluded values are left out."
          : `The ${SUBCOLUMN_FORMAT_LABELS[table.subcolumnFormat]} values become another summary format in a new data table. Replicate values cannot be recovered from summaries.`}
      </p>
      <label className="field">
        <span>New table holds</span>
        <select value={target} aria-label="New table holds"
          onChange={(e) => setTarget(e.target.value as SubcolumnFormat)}>
          {targets.map((f) => <option key={f} value={f}>{SUBCOLUMN_FORMAT_LABELS[f]}</option>)}
        </select>
        {(target === "mean_pm" || target === "upper_lower") && (
          <span className="field-note">The error is the SD.</span>
        )}
      </label>
      {error && <p className="import-error" role="alert">{error}</p>}
    </Modal>
  );
}
