import { useMemo, useState } from "react";
import Modal from "../../components/Modal";
import { readXlsx, type XlsxSheet } from "../../lib/engine";
import {
  applyImport, DEFAULT_FILTER, DEFAULT_SOURCE, defaultRoles, DELIMITER_LABELS,
  importWidth, prepareImport, type ColumnRole, type DecimalChoice,
  type DelimiterChoice, type FilterOptions, type PlacementOptions, type SourceOptions,
} from "../../project/importText";
import { flatColumns, hasAnyValue, tableShape } from "../../project/table";
import type { DataTableModel } from "../../project/types";

export interface ImportRequest {
  text?: string;                        // clipboard text to start from
  mode?: PlacementOptions["mode"];
  row?: number;                         // insert position (0-based)
  col?: number;                         // flat grid column
}

type Tab = "source" | "view" | "filter" | "placement";
const TABS: [Tab, string][] = [
  ["source", "Source"], ["view", "View"], ["filter", "Filter"], ["placement", "Placement"],
];

const ENCODINGS: [string, string][] = [
  ["utf-8", "UTF-8 (most files)"],
  ["windows-1252", "Windows-1252 / Latin-1"],
  ["utf-16le", "UTF-16"],
  ["macintosh", "Mac Roman"],
];

const intOr = (v: string, d: number) => {
  const n = Math.round(Number(v));
  return v.trim() !== "" && Number.isFinite(n) ? n : d;
};

/**
 * Import delimited text or a spreadsheet into the current table, in four
 * steps: Source (file or pasted text, delimiter, decimal separator,
 * lines to skip, titles row), View (what each column becomes), Filter
 * (rows / columns to keep, every k-th row, missing-value code, rows with
 * a blank X, trailing * = excluded) and Placement (replace, append or
 * write at a cell; transpose; values per dataset).
 */
export default function ImportDialog({ table, initial, onImport, onPasteAsIs, onClose }: {
  table: DataTableModel;
  initial?: ImportRequest;
  onImport: (fn: (t: DataTableModel) => DataTableModel) => void;
  onPasteAsIs?: () => void;
  onClose: () => void;
}) {
  const shape = tableShape(table.type);
  const [tab, setTab] = useState<Tab>("source");
  const [srcKind, setSrcKind] = useState<"file" | "paste">(initial?.text ? "paste" : "file");
  const [pasted, setPasted] = useState(initial?.text ?? "");
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [encoding, setEncoding] = useState("utf-8");
  const [sheets, setSheets] = useState<XlsxSheet[] | null>(null);
  const [sheetIx, setSheetIx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [src, setSrc] = useState<SourceOptions>(DEFAULT_SOURCE);
  const [filter, setFilter] = useState<FilterOptions>(DEFAULT_FILTER);
  const [roleOverride, setRoleOverride] = useState<Record<number, ColumnRole>>({});
  const firstY = flatColumns(table).findIndex((c) => c.kind === "y");
  const defaultMode: PlacementOptions["mode"] = initial?.mode
    ?? (hasAnyValue(table) ? "append" : "replace");
  const [place, setPlace] = useState<PlacementOptions>({
    mode: defaultMode,
    row: initial?.row ?? 0,
    col: Math.max(firstY, initial?.col ?? firstY),
    perDataset: Math.max(1, table.datasets[0]?.rows[0]?.length ?? 1),
    useTitles: true,
  });

  const isXlsx = !!sheets;
  const text = useMemo(() => {
    if (srcKind === "paste") return pasted;
    if (!file || isXlsx) return "";
    try { return new TextDecoder(encoding).decode(file.bytes); } catch { return ""; }
  }, [srcKind, pasted, file, encoding, isXlsx]);

  const source: string | string[][] = useMemo(() => (srcKind === "file" && sheets
    ? sheets[sheetIx]?.rows ?? [] : text), [srcKind, sheets, sheetIx, text]);
  const preview = useMemo(() => prepareImport(source, src, filter), [source, src, filter]);
  const defaults = useMemo(() => defaultRoles(table, preview), [table, preview]);
  const roles: ColumnRole[] = preview.columns.map((c, i) => roleOverride[c] ?? defaults[i]);
  const empty = preview.rows.length === 0 || preview.columns.length === 0;
  const yCount = roles.filter((r) => r === "y").length;
  const width = importWidth(table, place.perDataset);

  const pickFile = async (f: File | undefined) => {
    setError("");
    setSheets(null);
    setSheetIx(0);
    setRoleOverride({});
    if (!f) { setFile(null); return; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    setFile({ name: f.name, bytes });
    if (/\.xlsx$/i.test(f.name)) {
      setBusy(true);
      try {
        const s = await readXlsx(bytes);
        if (!s.length) throw new Error("the workbook has no worksheets");
        setSheets(s);
      } catch (e) {
        setError(`Could not read the workbook: ${e instanceof Error ? e.message : String(e)}`);
      } finally { setBusy(false); }
    } else if (/\.(xls|ods|numbers)$/i.test(f.name)) {
      setError("Only .xlsx workbooks can be read. Save the sheet as .xlsx or CSV, or copy and paste it.");
    }
  };

  const readClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setPasted(t);
      setRoleOverride({});
    } catch {
      setError("The browser did not allow reading the clipboard; paste into the box instead (Ctrl/Cmd+V).");
    }
  };

  const submit = () => {
    if (empty) { setError("Nothing to import with these settings."); return; }
    onImport((t) => applyImport(t, preview, roles, place,
      { skipBlankX: filter.skipBlankX, asteriskExcluded: filter.asteriskExcluded }));
  };

  const num = (label: string, value: number | null, set: (v: number | null) => void,
    opts: { min?: number; blank?: string } = {}) => (
      <label className="field field-num">
        <span>{label}</span>
        <input inputMode="numeric" value={value === null ? "" : String(value)}
          placeholder={opts.blank}
          onChange={(e) => set(e.target.value.trim() === "" ? null
            : Math.max(opts.min ?? 0, intOr(e.target.value, opts.min ?? 0)))} />
      </label>
  );

  const roleLabel = (r: ColumnRole) => r === "x" ? "X" : r === "y" ? "Y"
    : r === "rowTitle" ? "Row titles" : "Skip";
  const roleChoices: ColumnRole[] = [
    ...(shape.hasX ? ["x" as const] : []),
    "y",
    ...(shape.hasRowTitles ? ["rowTitle" as const] : []),
    "ignore",
  ];

  const where = place.mode === "replace" ? "replacing the table's values"
    : place.mode === "append" ? "below the last row"
      : `from row ${place.row + 1}, Y column ${place.col - firstY + 1}`;
  const datasetsNeeded = Math.ceil(yCount / Math.max(1, width));

  return (
    <Modal title="Import data" className="modal-wide import-dialog" onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          {onPasteAsIs && (
            <button type="button" className="spacer" onClick={onPasteAsIs}>Paste as is</button>
          )}
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || empty}>Import</button>
        </>
      }>
      <div className="dialog-tabs" role="tablist" aria-label="Import steps">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`imp-tab-${id}`}
            aria-selected={tab === id} aria-controls={`imp-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = TABS.findIndex(([t]) => t === tab);
              const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0];
              setTab(next);
              requestAnimationFrame(() => document.getElementById(`imp-tab-${next}`)?.focus());
            }}
            onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "source" && (
        <div className="dialog-panel" role="tabpanel" id="imp-panel-source"
          aria-labelledby="imp-tab-source">
          <fieldset className="field-radios">
            <legend>Read from</legend>
            <label><input type="radio" name="imp-src" checked={srcKind === "file"}
              onChange={() => setSrcKind("file")} /> A file (CSV, TSV, text or .xlsx)</label>
            <label><input type="radio" name="imp-src" checked={srcKind === "paste"}
              onChange={() => setSrcKind("paste")} /> Pasted text</label>
          </fieldset>
          {srcKind === "file" ? (
            <div className="field-row">
              <label className="field">
                <span>File</span>
                <input type="file" aria-label="File to import"
                  accept=".csv,.tsv,.txt,.tab,.dat,.prn,.xlsx,text/csv,text/plain"
                  onChange={(e) => { void pickFile(e.target.files?.[0]); }} />
              </label>
              {sheets && sheets.length > 1 && (
                <label className="field">
                  <span>Worksheet</span>
                  <select value={sheetIx} onChange={(e) => { setSheetIx(Number(e.target.value)); setRoleOverride({}); }}>
                    {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                  </select>
                </label>
              )}
              {!isXlsx && (
                <label className="field">
                  <span>Text encoding</span>
                  <select value={encoding} onChange={(e) => setEncoding(e.target.value)}>
                    {ENCODINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              )}
            </div>
          ) : (
            <label className="field">
              <span>Text to import</span>
              <textarea rows={6} value={pasted} spellCheck={false}
                aria-label="Text to import"
                placeholder={"Dose;Response\n0,1;98,5\n1;50,2"}
                onChange={(e) => { setPasted(e.target.value); setRoleOverride({}); }} />
              <span className="field-note">
                Paste here, or <button type="button" className="linkish"
                  onClick={() => { void readClipboard(); }}>read the clipboard</button>.
              </span>
            </label>
          )}
          {!isXlsx && (
            <div className="field-row">
              <label className="field">
                <span>Columns separated by</span>
                <select value={src.delimiter}
                  onChange={(e) => { setSrc({ ...src, delimiter: e.target.value as DelimiterChoice }); setRoleOverride({}); }}>
                  <option value="auto">Detect{preview.delimiter && src.delimiter === "auto"
                    ? ` (${DELIMITER_LABELS[preview.delimiter]})` : ""}</option>
                  <option value="tab">Tab</option>
                  <option value="comma">Comma</option>
                  <option value="semicolon">Semicolon</option>
                  <option value="space">Spaces</option>
                </select>
              </label>
              <label className="field">
                <span>Decimal separator</span>
                <select value={src.decimal}
                  onChange={(e) => setSrc({ ...src, decimal: e.target.value as DecimalChoice })}>
                  <option value="auto">Detect ({preview.decimal === "," ? "comma" : "point"})</option>
                  <option value=".">Point (1.5)</option>
                  <option value=",">Comma (1,5)</option>
                </select>
              </label>
            </div>
          )}
          <div className="field-row">
            {num("Lines to skip at the top", src.skipLines,
              (v) => { setSrc({ ...src, skipLines: v ?? 0 }); setRoleOverride({}); })}
            <label className="field-check">
              <input type="checkbox" checked={src.titlesRow}
                onChange={(e) => setSrc({ ...src, titlesRow: e.target.checked })} />
              First row (after skipped lines) holds column titles
            </label>
          </div>
          {!isXlsx && srcKind === "file" && (
            <p className="field-note">
              If accented letters or µ look wrong in the preview, the file was
              saved in another encoding: try Windows-1252.
            </p>
          )}
        </div>
      )}

      {tab === "view" && (
        <div className="dialog-panel" role="tabpanel" id="imp-panel-view"
          aria-labelledby="imp-tab-view">
          <p className="field-note">
            Choose what each column becomes. Y columns fill the table&apos;s Y
            subcolumns left to right.
          </p>
        </div>
      )}

      {tab === "filter" && (
        <div className="dialog-panel" role="tabpanel" id="imp-panel-filter"
          aria-labelledby="imp-tab-filter">
          <div className="field-row">
            {num("First row", filter.rowFrom, (v) => setFilter({ ...filter, rowFrom: v ?? 1 }), { min: 1 })}
            {num("Last row", filter.rowTo, (v) => setFilter({ ...filter, rowTo: v }), { min: 1, blank: "last" })}
            {num("Keep every k-th row", filter.everyK, (v) => setFilter({ ...filter, everyK: v ?? 1 }), { min: 1 })}
          </div>
          <div className="field-row">
            {num("First column", filter.colFrom, (v) => { setFilter({ ...filter, colFrom: v ?? 1 }); setRoleOverride({}); }, { min: 1 })}
            {num("Last column", filter.colTo, (v) => { setFilter({ ...filter, colTo: v }); setRoleOverride({}); }, { min: 1, blank: "last" })}
            <label className="field field-num">
              <span>Missing-value code</span>
              <input value={filter.missingCode} placeholder="e.g. NA"
                onChange={(e) => setFilter({ ...filter, missingCode: e.target.value })} />
            </label>
          </div>
          <p className="field-note">
            Rows count from the first row of data (after the titles row).
            &ldquo;Every k-th row&rdquo; imports one row, then skips k − 1.
          </p>
          {shape.hasX && (
            <label className="field-check">
              <input type="checkbox" checked={filter.skipBlankX}
                onChange={(e) => setFilter({ ...filter, skipBlankX: e.target.checked })} />
              Skip rows whose X value is blank
            </label>
          )}
          <label className="field-check">
            <input type="checkbox" checked={filter.asteriskExcluded}
              onChange={(e) => setFilter({ ...filter, asteriskExcluded: e.target.checked })} />
            A value followed by * (12.5*) is imported as excluded
          </label>
        </div>
      )}

      {tab === "placement" && (
        <div className="dialog-panel" role="tabpanel" id="imp-panel-placement"
          aria-labelledby="imp-tab-placement">
          <fieldset className="field-radios">
            <legend>Put the values</legend>
            <label><input type="radio" name="imp-mode" checked={place.mode === "replace"}
              onChange={() => setPlace({ ...place, mode: "replace" })} />
              In place of the table&apos;s current values</label>
            <label><input type="radio" name="imp-mode" checked={place.mode === "append"}
              onChange={() => setPlace({ ...place, mode: "append" })} />
              Below the last row with values</label>
            <label><input type="radio" name="imp-mode" checked={place.mode === "insert"}
              onChange={() => setPlace({ ...place, mode: "insert" })} />
              Starting at a cell</label>
          </fieldset>
          {place.mode === "insert" && (
            <div className="field-row">
              {num("Row", place.row + 1, (v) => setPlace({ ...place, row: Math.max(0, (v ?? 1) - 1) }), { min: 1 })}
              {num("Y column", place.col - firstY + 1,
                (v) => setPlace({ ...place, col: firstY + Math.max(0, (v ?? 1) - 1) }), { min: 1 })}
            </div>
          )}
          {shape.hasSubcolumns && table.subcolumnFormat === "replicates" && table.type !== "nested" && (
            num("Y columns per dataset (replicates)", place.perDataset,
              (v) => setPlace({ ...place, perDataset: Math.max(1, Math.min(24, v ?? 1)) }), { min: 1 })
          )}
          <label className="field-check">
            <input type="checkbox" checked={src.transpose}
              onChange={(e) => { setSrc({ ...src, transpose: e.target.checked }); setRoleOverride({}); }} />
            Transpose (rows of the source become columns)
          </label>
          {src.titlesRow && (
            <label className="field-check">
              <input type="checkbox" checked={place.useTitles}
                onChange={(e) => setPlace({ ...place, useTitles: e.target.checked })} />
              Name {shape.datasetNoun.toLowerCase()}s{shape.hasX ? " and X" : ""} from the titles row
            </label>
          )}
        </div>
      )}

      <div className="import-preview" tabIndex={0} aria-label="Preview of the data to import">
        {empty ? (
          <p className="import-summary" style={{ padding: "10px 12px" }}>
            {busy ? "Reading the workbook…" : "Nothing to preview yet."}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="rn" />
                {preview.columns.map((c, i) => (
                  <th key={c}>
                    <select aria-label={`Column ${c} becomes`} value={roles[i]}
                      onChange={(e) => setRoleOverride({ ...roleOverride, [c]: e.target.value as ColumnRole })}>
                      {roleChoices.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </select>
                  </th>
                ))}
              </tr>
              <tr>
                <th className="rn" />
                {preview.columns.map((c, i) => (
                  <th key={c} title={preview.titles?.[i] || `Column ${c}`}>
                    {preview.titles?.[i] || `Column ${c}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, tab === "view" ? 200 : 8).map((r, ri) => (
                <tr key={ri}>
                  <td className="rn">{ri + 1}</td>
                  {r.map((v, i) => <td key={i} className={`role-${roles[i]}`}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="import-summary" role="status">
        {empty ? "" : `${preview.rows.length} of ${preview.totalRows} rows, ${yCount} Y column${yCount === 1 ? "" : "s"}`
          + `${datasetsNeeded > 1 ? ` (${datasetsNeeded} ${shape.datasetNoun.toLowerCase()}s)` : ""}, ${where}.`}
      </p>
      {error && <p className="import-error" role="alert">{error}</p>}
    </Modal>
  );
}
